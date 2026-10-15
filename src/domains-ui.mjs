/**
 * src/domains-ui.mjs
 *
 * Dedicated Domain Intelligence & SERP Monopoly Studio UI (Level 4B)
 * Pure ES Module generating the full HTML application for /domains.
 *
 * Features:
 * - Top 5 Executive KPI Cards with SERP Monopoly Share & Baby Giants detection.
 * - Strategic Arbitrage Lens Toolbar (Baby Giants, Easy Arbitrage, Bleeding Giants, High Multipliers, Multi-Account).
 * - Multi-Pillar Domain Leaderboard with Live WHOIS Age Badges, Multiplier ratios, and SERP distribution.
 * - Slide-Over Deep Domain Dossier Drawer (4 Tabs: Ranked Pins, Money Articles, Keyword Monopoly Matrix, Associated Creators).
 * - Client-side CSV export protected against CSV formula injection (DDE).
 * - Dark / Light Mode with instant hydration.
 */

export function getDomainsPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <title>Domain Intelligence & SERP Monopoly Studio | Pinterest Arbitrage</title>
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
    if (localStorage.getItem('pa_theme') === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  </script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
  </style>
</head>
<body class="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen antialiased flex flex-col font-sans transition-colors duration-150" x-data="domainsApp()">

  <!-- Toast Notification Container -->
  <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
    <template x-for="toast in toasts" :key="toast.id">
      <div class="pointer-events-auto px-4 py-3 rounded-xl border text-xs shadow-2xl flex items-center justify-between gap-3 transition-all transform duration-300"
           :class="{
             'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-500/40 text-emerald-900 dark:text-emerald-200': toast.type === 'success',
             'bg-rose-50 dark:bg-rose-950/90 border-rose-500/40 text-rose-900 dark:text-rose-200': toast.type === 'error',
             'bg-sky-50 dark:bg-sky-950/90 border-sky-500/40 text-sky-900 dark:text-sky-200': toast.type === 'info',
             'bg-amber-50 dark:bg-amber-950/90 border-amber-500/40 text-amber-900 dark:text-amber-200': toast.type === 'warning'
           }">
        <span x-text="toast.message" class="font-medium"></span>
        <button @click="removeToast(toast.id)" class="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs">✕</button>
      </div>
    </template>
  </div>

  <!-- Top Navigation Header -->
  <header class="border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between transition-colors">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-3">
        <a href="/domains" class="flex items-center gap-2 group">
          <div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold group-hover:scale-105 transition-transform">
            🌐
          </div>
          <div>
            <div class="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Domain Intelligence Studio
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 font-normal">Level 4B</span>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">SERP Monopoly, WHOIS Age & Pin-to-URL Multipliers</div>
          </div>
        </a>
      </div>

      <nav class="hidden md:flex items-center gap-1 text-xs">
        <a href="/" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">Overview</a>
        <a href="/accounts" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">Creator & PinArchive</a>
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">Keywords Radar</a>
        <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">Discovery</a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">Campaign Folders</a>
        <a href="/domains" class="px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/20">Domain Radar</a>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <!-- Theme Switcher -->
      <button @click="toggleTheme()"
              class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
              :title="darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'">
        <span x-text="darkMode ? '☀️' : '🌙'">🌙</span>
        <span class="hidden sm:inline font-mono text-[11px]" x-text="darkMode ? 'Light' : 'Dark'">Dark</span>
      </button>

      <!-- Refresh Button -->
      <button @click="loadDomains(true)"
              class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5">
        <span :class="{ 'animate-spin': loading }">🔄</span>
        <span class="hidden sm:inline">Refresh</span>
      </button>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

    <!-- TOP 5 EXECUTIVE KPI CARDS -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      <!-- 1. Total Ranked Domains -->
      <div @click="setPreset('all')"
           class="bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-sky-500/50"
           :class="activePreset === 'all' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-200 dark:border-slate-800'"
           title="Click to reset filters and view all domains">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono uppercase tracking-wider">Ranked Domains</span>
          <span class="text-xs">🌐</span>
        </div>
        <span class="text-2xl font-bold font-mono text-slate-900 dark:text-white" x-text="formatNumber(overview.total_domains)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Indexed sites (Click to reset)</span>
      </div>

      <!-- 2. Top-10 SERP Monopoly -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono uppercase tracking-wider">Top-5 Monopoly</span>
          <span class="text-xs">🏆</span>
        </div>
        <span class="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400" x-text="(overview.top5_monopoly_pct || 0) + '%'">0%</span>
        <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
          <div class="bg-amber-500 h-1.5 rounded-full transition-all duration-500" :style="'width: ' + Math.min(100, overview.top5_monopoly_pct || 0) + '%'"></div>
        </div>
      </div>

      <!-- 3. Baby Giants (< 2 Years) -->
      <div @click="setPreset(activePreset === 'baby_giants' ? 'all' : 'baby_giants')"
           class="bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-emerald-500/50"
           :class="activePreset === 'baby_giants' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Baby Giants (&lt; 2y)</span>
          <span class="text-xs">🌱</span>
        </div>
        <span class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400" x-text="formatNumber(overview.baby_giants_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&lt; 2y with Top 10 or 1k+ saves</span>
      </div>

      <!-- 4. Multi-Account Networks -->
      <div @click="setPreset(activePreset === 'multi_account' ? 'all' : 'multi_account')"
           class="bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-purple-500/50"
           :class="activePreset === 'multi_account' ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-slate-800'">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400">PBN / Multi-Acct</span>
          <span class="text-xs">🕸️</span>
        </div>
        <span class="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400" x-text="formatNumber(overview.multi_account_count)">0</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">&gt;= 2 accounts pushing traffic</span>
      </div>

      <!-- 5. Avg Pin-to-URL Multiplier -->
      <div @click="setPreset(activePreset === 'high_multipliers' ? 'all' : 'high_multipliers')"
           class="bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-1 shadow-sm cursor-pointer transition-all hover:border-amber-500/50"
           :class="activePreset === 'high_multipliers' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-slate-800'"
           title="Click to filter by High Multipliers (>= 3.0x pins/URL)">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span class="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">Avg Pin / URL</span>
          <span class="text-xs">🔁</span>
        </div>
        <span class="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400" x-text="(overview.avg_pins_per_url || 1.0) + 'x'">1.0x</span>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">Click for High Multipliers (&gt;= 3x)</span>
      </div>
    </div>

    <!-- STRATEGIC LENSES TOOLBAR -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">Arbitrage Lenses:</span>
          <span class="text-xs text-slate-400 dark:text-slate-500">Quick strategic presets</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Verify Entire Database Global Button -->
          <button @click="toggleGlobalEnrichment()"
                  class="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                  :class="globalEnriching ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20' : 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 border-transparent'"
                  :title="globalEnriching ? 'Pause global verification queue' : 'Automatically verify WHOIS age for all unverified domains in the entire database'">
            <span :class="{ 'animate-spin': globalEnriching }">🚀</span>
            <span x-text="globalEnriching ? 'Pause Auto-Verify (' + (globalStats.percent_complete || 0) + '%)' : 'Verify Entire Database'">Verify Entire Database</span>
          </button>

          <!-- Batch Check Visible Domains Button -->
          <button @click="batchEnrichVisible()"
                  :disabled="batchEnriching || globalEnriching"
                  class="px-3 py-1.5 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-xs font-semibold text-sky-700 dark:text-sky-300 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Check WHOIS age for unverified domains on the current page">
            <span :class="{ 'animate-spin': batchEnriching }">⚡</span>
            <span x-text="batchEnriching ? 'Checking (' + batchProgress.done + '/' + batchProgress.total + ')...' : 'Batch Check Page'">Batch Check Page</span>
          </button>

          <button @click="downloadDomainsCsv()"
                  class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-sm">
            <span>📥</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <!-- Preset Pills -->
      <div class="flex items-center gap-2 flex-wrap">
        <button @click="setPreset('all')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'all' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🌐</span> All Domains
        </button>

        <button @click="setPreset('baby_giants')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'baby_giants' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🌱</span> Baby Giants (&lt; 2 Years & Top 10)
        </button>

        <button @click="setPreset('easy_arbitrage')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'easy_arbitrage' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🚀</span> Easy Arbitrage (&lt;= 25 Pins & Top 10)
        </button>

        <button @click="setPreset('bleeding_giants')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'bleeding_giants' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🩸</span> Bleeding Giants (&gt;= 30% Displaced)
        </button>

        <button @click="setPreset('high_multipliers')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'high_multipliers' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🔁</span> High Multipliers (&gt;= 3.0x Pins/URL)
        </button>

        <button @click="setPreset('multi_account')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                :class="activePreset === 'multi_account' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'">
          <span>🕸️</span> Multi-Account Networks
        </button>
      </div>

      <!-- Filter Controls Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <!-- Search Input -->
        <div class="relative">
          <input type="text"
                 x-model="searchQuery"
                 @input.debounce.400ms="applySearch()"
                 placeholder="Search domain (e.g. tasty)..."
                 class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40">
          <span class="absolute right-3 top-2.5 text-xs text-slate-400">🔍</span>
        </div>

        <!-- Campaign Folder Dropdown -->
        <div>
          <select x-model="selectedFolderId"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40">
            <option value="">📁 All Folders</option>
            <template x-for="f in folders" :key="f.id">
              <option :value="f.id" x-text="f.name + ' (' + (f.item_count || 0) + ')'"></option>
            </template>
          </select>
        </div>

        <!-- Pillar Dropdown -->
        <div>
          <select x-model="selectedPillar"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40">
            <option value="all">🏛️ All Pillars (P1 + P2 + P4)</option>
            <option value="serp">🎯 SERP Radar (P2 Only)</option>
            <option value="archive">📦 PinArchive (P4 Only)</option>
            <option value="competitors">👥 Competitors (P1 Only)</option>
          </select>
        </div>

        <!-- Sort By Dropdown -->
        <div>
          <select x-model="sortBy"
                  @change="loadDomains(true)"
                  class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 font-mono">
            <option value="visibility">Sort: SERP Visibility Score</option>
            <option value="arbitrage_score">Sort: Arbitrage Velocity / Age</option>
            <option value="age_asc">Sort: Youngest Domain Age</option>
            <option value="pins_count">Sort: Total Pins Count</option>
            <option value="saves">Sort: Total Saves</option>
            <option value="velocity">Sort: Daily Save Velocity</option>
            <option value="avg_rank">Sort: Best Average Rank</option>
            <option value="multiplier">Sort: Pin-to-URL Multiplier</option>
          </select>
        </div>

        <!-- Marketplace Toggle -->
        <div class="flex items-center justify-between px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <label for="marketplaces-toggle" class="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
            <span>📰</span>
            <span>Blogs Only</span>
          </label>
          <input id="marketplaces-toggle"
                 type="checkbox"
                 x-model="excludeMarketplaces"
                 @change="loadDomains(true)"
                 class="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer">
        </div>
      </div>
    </div>

    <!-- DOMAINS LEADERBOARD TABLE -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <!-- Table Header Bar -->
      <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-base">🏆</span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Domain Authority & Monopoly Leaderboard</h2>
          <span class="text-xs text-slate-400 font-mono" x-text="'(' + formatNumber(totalDomains) + ' domains matching)'"></span>
        </div>
        <div class="text-xs text-slate-400 font-mono" x-text="'Page ' + currentPage + ' of ' + totalPages"></div>
      </div>

      <!-- Global Verification Active Banner -->
      <template x-if="globalEnriching">
        <div class="px-5 py-3 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-emerald-500/10 border-b border-sky-500/20 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-mono flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="animate-spin text-sm">🚀</span>
              <span class="font-bold text-sky-800 dark:text-sky-300">Global Verification In Progress:</span>
              <span class="text-slate-600 dark:text-slate-300" x-text="formatNumber(globalStats.checked_domains) + ' / ' + formatNumber(globalStats.total_domains) + ' domains (' + (globalStats.percent_complete || 0) + '%)'"></span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-emerald-700 dark:text-emerald-400 font-bold" x-text="'🌱 ' + formatNumber(globalStats.resolved_domains) + ' resolved'"></span>
              <span class="text-amber-700 dark:text-amber-400 font-bold" x-text="'🔒 ' + formatNumber(globalStats.failed_domains) + ' shielded'"></span>
              <span class="text-slate-500 font-mono" x-text="'⏳ ' + formatNumber(globalStats.unchecked_domains) + ' remaining'"></span>
              <button @click="stopGlobalEnrichment()"
                      class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1 shadow-sm">
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            </div>
          </div>
          <!-- Animated Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 h-full transition-all duration-500"
                 :style="'width: ' + (globalStats.percent_complete || 0) + '%'"></div>
          </div>
        </div>
      </template>

      <!-- Table Element -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-mono text-[11px] uppercase">
              <th class="py-3 px-4 font-semibold"># & Domain</th>
              <th class="py-3 px-4 font-semibold">Domain Age & Registry</th>
              <th class="py-3 px-4 font-semibold">Pins & Multiplier</th>
              <th class="py-3 px-4 font-semibold">SERP Distribution</th>
              <th class="py-3 px-4 font-semibold">Saves & Velocity</th>
              <th class="py-3 px-4 font-semibold">Arbitrage & Accounts</th>
              <th class="py-3 px-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
            <!-- Loading Row -->
            <template x-if="loading">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400 font-mono">
                  <div class="inline-flex items-center gap-2">
                    <span class="animate-spin text-base">⏳</span>
                    <span>Querying cross-pillar domain authority...</span>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty Row -->
            <template x-if="!loading && domains.length === 0">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-2xl">🔍</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300">No domains match the selected filters</span>
                    <button @click="resetFilters()" class="text-xs text-sky-600 hover:underline">Reset all filters</button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Data Rows -->
            <template x-for="(d, idx) in domains" :key="d.domain">
              <tr @click="openDossier(d.domain)"
                  class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group">
                <!-- 1. Rank & Domain -->
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <span class="text-slate-400 font-mono text-[11px] w-6 shrink-0" x-text="((currentPage - 1) * limit) + idx + 1"></span>
                    <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d.domain) + '&sz=32'"
                         class="w-4 h-4 rounded shrink-0 bg-slate-200 dark:bg-slate-700"
                         loading="lazy"
                         onerror="this.onerror=null; this.style.display='none'">
                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-slate-900 dark:text-white truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" x-text="d.domain"></span>
                        <!-- Smart Badges -->
                        <template x-if="d.age_years !== null && d.age_years <= 2.0 && d.top10_pins >= 1">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0" title="Baby Giant: < 2 Years with Top-10 Pins">🌱 Baby Giant</span>
                        </template>
                        <template x-if="d.accounts_count >= 3">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0" :title="'PBN Network: ' + d.accounts_count + ' accounts pushing traffic'">🕸️ PBN</span>
                        </template>
                        <template x-if="d.pins_per_url >= 3.0">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0" :title="'High Multiplier: ' + d.pins_per_url + 'x pins/URL'">⚡ Multi</span>
                        </template>
                        <template x-if="d.displaced_pins >= 3 && d.decay_rate_pct >= 30">
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0" :title="'Bleeding Giant: ' + d.decay_rate_pct + '% displacement'">🩸 Bleeding</span>
                        </template>
                        <a :href="safeUrl('https://' + d.domain)"
                           target="_blank"
                           rel="noopener noreferrer"
                           @click.stop
                           class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs shrink-0"
                           title="Visit website in new tab">
                          ↗
                        </a>
                      </div>
                      <span class="text-[10px] text-slate-400 font-mono" x-text="d.unique_urls + ' unique URLs'"></span>
                    </div>
                  </div>
                </td>

                <!-- 2. Domain Age & Registry -->
                <td class="py-3 px-4">
                  <!-- State 1: Resolved Age -->
                  <template x-if="d.age_years !== null && d.age_years !== undefined">
                    <div class="flex flex-col gap-0.5">
                      <span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md w-fit"
                            :class="{
                              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30': d.age_years <= 2.0,
                              'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/30': d.age_years > 2.0 && d.age_years <= 5.0,
                              'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30': d.age_years > 5.0
                            }"
                            :title="d.domain_created_at ? 'Registered: ' + d.domain_created_at.slice(0, 10) + ' (' + (d.lookup_source || 'whois') + ')' : 'Age'">
                        <span x-text="d.age_years <= 2.0 ? '🌱' : (d.age_years <= 5.0 ? '🏢' : '🏛️')"></span>
                        <span x-text="d.age_years + 'y (' + formatNumber(d.age_days) + 'd)'"></span>
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono" x-text="d.domain_created_at ? 'Reg: ' + d.domain_created_at.slice(0, 10) : ''"></span>
                    </div>
                  </template>

                  <!-- State 2: Checked & Privacy Shielded / Redacted Date -->
                  <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status === 'failed'">
                    <div class="flex items-center gap-1.5" @click.stop>
                      <span class="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            title="Checked via WHOIS/RDAP: Registry withholds public registration date or is privacy-shielded">
                        <span>🔒</span>
                        <span>Redacted / Shielded</span>
                      </span>
                      <button @click.stop="enrichAge(d.domain, true)"
                              :disabled="enrichingDomains[d.domain]"
                              class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px] transition"
                              title="Force Re-check WHOIS/RDAP">
                        <span :class="{ 'animate-spin': enrichingDomains[d.domain] }">🔄</span>
                      </button>
                    </div>
                  </template>

                  <!-- State 3: Unchecked Domain -->
                  <template x-if="(d.age_years === null || d.age_years === undefined) && d.age_status !== 'failed'">
                    <button @click.stop="enrichAge(d.domain)"
                            :disabled="enrichingDomains[d.domain]"
                            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-mono border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 disabled:opacity-60 shadow-sm">
                      <span :class="{ 'animate-spin': enrichingDomains[d.domain] }" x-text="enrichingDomains[d.domain] ? '⏳' : '🔍'">🔍</span>
                      <span x-text="enrichingDomains[d.domain] ? 'Checking...' : 'Check Age'">Check Age</span>
                    </button>
                  </template>
                </td>

                <!-- 3. Pins & Multiplier -->
                <td class="py-3 px-4 font-mono">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_pins)"></span>
                      <span class="text-slate-400 text-[10px]">pins</span>
                    </div>
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded w-fit"
                          :class="d.pins_per_url >= 3.0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'">
                      <span>🔁</span>
                      <span x-text="d.pins_per_url + 'x Pins/URL'"></span>
                    </span>
                  </div>
                </td>

                <!-- 4. SERP Distribution -->
                <td class="py-3 px-4">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-[11px] font-mono">
                      <span class="text-emerald-600 dark:text-emerald-400 font-bold" title="Top 3 Pins" x-text="'🥇 ' + d.top3_pins"></span>
                      <span class="text-sky-600 dark:text-sky-400 font-bold" title="Top 10 Pins" x-text="'🎯 ' + d.top10_pins"></span>
                      <template x-if="d.displaced_pins > 0">
                        <span class="text-rose-600 dark:text-rose-400 font-bold" :title="'Displaced: ' + d.decay_rate_pct + '%'" x-text="'📉 ' + d.displaced_pins"></span>
                      </template>
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                      <span x-text="'Avg #' + (d.avg_rank || '—')"></span>
                      <span class="text-slate-300 dark:text-slate-700">|</span>
                      <span class="text-sky-600 dark:text-sky-400 font-semibold" x-text="'Vis: ' + d.visibility_score"></span>
                    </div>
                  </div>
                </td>

                <!-- 5. Saves & Velocity -->
                <td class="py-3 px-4 font-mono">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1">
                      <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(d.total_saves)"></span>
                      <span class="text-slate-400 text-[10px]">saves</span>
                    </div>
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400" x-text="'+' + d.avg_velocity + '/d'"></span>
                  </div>
                </td>

                <!-- 6. Arbitrage & Accounts -->
                <td class="py-3 px-4">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5">
                      <span class="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                            :title="'Arbitrage Velocity / Age Score: ' + d.arbitrage_score">
                        <span>⚡</span>
                        <span x-text="d.arbitrage_score"></span>
                      </span>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <template x-for="acc in (d.sample_accounts || []).slice(0, 2)" :key="acc">
                        <span class="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1 py-0.2 rounded" x-text="'@' + acc"></span>
                      </template>
                      <template x-if="d.accounts_count > 2">
                        <span class="text-[10px] text-slate-400 font-mono" x-text="'+' + (d.accounts_count - 2)"></span>
                      </template>
                    </div>
                  </div>
                </td>

                <!-- 7. Actions -->
                <td class="py-3 px-4 text-right">
                  <button @click.stop="openDossier(d.domain)"
                          class="px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-600 dark:text-sky-400 text-xs font-semibold transition border border-sky-200 dark:border-sky-800">
                    Dossier →
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div class="flex items-center gap-2 font-mono">
          <span>Showing</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="Math.min(totalDomains, ((currentPage - 1) * limit) + 1) + ' - ' + Math.min(totalDomains, currentPage * limit)"></span>
          <span>of</span>
          <span class="font-bold text-slate-900 dark:text-white" x-text="formatNumber(totalDomains)"></span>
        </div>

        <div class="flex items-center gap-2">
          <button @click="changePage(currentPage - 1)"
                  :disabled="currentPage <= 1 || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            ← Previous
          </button>
          <span class="font-mono text-xs text-slate-700 dark:text-slate-300 font-bold px-2" x-text="currentPage + ' / ' + totalPages"></span>
          <button @click="changePage(currentPage + 1)"
                  :disabled="currentPage >= totalPages || loading"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition">
            Next →
          </button>
        </div>
      </div>
    </div>

  </main>

  <!-- SLIDE-OVER DEEP DOMAIN DOSSIER DRAWER -->
  <div x-show="isDossierOpen"
       class="fixed inset-0 z-50 overflow-hidden"
       x-cloak
       @keydown.escape.window="closeDossier()">
    <!-- Backdrop -->
    <div x-show="isDossierOpen"
         x-transition:enter="transition-opacity ease-linear duration-200"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-200"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"
         class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
         @click="closeDossier()"></div>

    <!-- Drawer Panel Container -->
    <div class="fixed inset-y-0 right-0 max-w-full flex pl-10">
      <div x-show="isDossierOpen"
           x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"
           class="w-screen max-w-3xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">

        <!-- Drawer Header -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <img :src="'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dossierDomain) + '&sz=32'"
                   class="w-7 h-7 rounded shadow-sm bg-slate-200 dark:bg-slate-700"
                   loading="lazy"
                   onerror="this.onerror=null; this.style.display='none'">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg font-bold text-slate-900 dark:text-white font-mono" x-text="dossierDomain"></h2>
                  <a :href="safeUrl('https://' + dossierDomain)"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="text-xs text-sky-600 hover:underline shrink-0">
                    Visit ↗
                  </a>
                  <!-- SEO Spy Shortcuts -->
                  <span class="text-slate-300 dark:text-slate-700">•</span>
                  <a :href="safeUrl('https://www.similarweb.com/website/' + dossierDomain)"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="text-[11px] font-mono text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:underline shrink-0"
                     title="View traffic and geography on Similarweb">
                    Similarweb ↗
                  </a>
                  <span class="text-slate-300 dark:text-slate-700">•</span>
                  <a :href="safeUrl('https://web.archive.org/web/*/' + dossierDomain)"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="text-[11px] font-mono text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:underline shrink-0"
                     title="View historical archive on Wayback Machine">
                    Wayback ↗
                  </a>
                  <span class="text-slate-300 dark:text-slate-700">•</span>
                  <a :href="safeUrl('https://www.google.com/search?q=site%3A' + encodeURIComponent(dossierDomain))"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="text-[11px] font-mono text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:underline shrink-0"
                     title="View Google indexation (site:domain)">
                    Google Site ↗
                  </a>
                </div>
                <div class="text-xs text-slate-400">Deep Domain Dossier & Cross-Pillar Forensic Audit</div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button @click="recheckAgeForDossier()"
                      :disabled="enrichingDomains[dossierDomain]"
                      class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shadow-sm disabled:opacity-60">
                <span :class="{ 'animate-spin': enrichingDomains[dossierDomain] }">🔄</span>
                <span x-text="enrichingDomains[dossierDomain] ? 'Checking...' : 'Re-check Age'">Re-check Age</span>
              </button>
              <button @click="closeDossier()"
                      class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold transition">
                ✕
              </button>
            </div>
          </div>

          <!-- WHOIS Summary Strip -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 font-mono text-[11px]">
            <div class="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
              <span class="text-slate-400 text-[10px] uppercase">Registered</span>
              <span class="font-bold text-slate-800 dark:text-slate-200"
                    x-text="dossierData?.age_info?.registered_at ? dossierData.age_info.registered_at.slice(0, 10) : (dossierData?.age_info?.lookup_status === 'failed' ? '🔒 Redacted' : 'Unknown')"></span>
            </div>
            <div class="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
              <span class="text-slate-400 text-[10px] uppercase">Age</span>
              <span class="font-bold"
                    :class="dossierData?.age_info?.age_years != null ? 'text-emerald-600 dark:text-emerald-400' : (dossierData?.age_info?.lookup_status === 'failed' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')"
                    x-text="dossierData?.age_info?.age_years != null ? dossierData.age_info.age_years + 'y (' + dossierData.age_info.age_days + 'd)' : (dossierData?.age_info?.lookup_status === 'failed' ? 'Withheld by Registry' : 'Unverified')"></span>
            </div>
            <div class="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
              <span class="text-slate-400 text-[10px] uppercase">Expires</span>
              <span class="font-bold text-slate-800 dark:text-slate-200" x-text="dossierData?.age_info?.expires_at ? dossierData.age_info.expires_at.slice(0, 10) : '—'"></span>
            </div>
            <div class="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
              <span class="text-slate-400 text-[10px] uppercase">Lookup Source</span>
              <span class="font-bold text-sky-600 dark:text-sky-400"
                    x-text="dossierData?.age_info?.lookup_source ? dossierData.age_info.lookup_source + (dossierData?.age_info?.lookup_status === 'failed' ? ' (shielded)' : '') : '—'"></span>
            </div>
          </div>

          <!-- Privacy Shielded Explanatory Note -->
          <template x-if="dossierData?.age_info?.lookup_status === 'failed'">
            <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 font-mono">
              <span class="text-sm shrink-0">ℹ️</span>
              <div>
                <span class="font-bold">Registry Withheld / Privacy Shielded:</span>
                <span> This domain was queried across Direct Authoritative RDAP, WHOIS Port 43, and Certificate Transparency, but the registry or parent platform redacted the public creation date.</span>
              </div>
            </div>
          </template>

          <!-- Dossier High-Level Stats Cards -->
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 font-mono text-center">
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">Pins</div>
              <div class="text-xs font-bold text-slate-900 dark:text-white" x-text="dossierData?.summary?.total_pins || 0"></div>
            </div>
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">URLs</div>
              <div class="text-xs font-bold text-slate-900 dark:text-white" x-text="dossierData?.summary?.unique_urls || 0"></div>
            </div>
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">Multiplier</div>
              <div class="text-xs font-bold text-amber-600 dark:text-amber-400" x-text="(dossierData?.summary?.pins_per_url || 1) + 'x'"></div>
            </div>
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">Keywords</div>
              <div class="text-xs font-bold text-sky-600 dark:text-sky-400" x-text="dossierData?.summary?.ranked_keywords_count || 0"></div>
            </div>
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">Saves</div>
              <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(dossierData?.summary?.total_saves || 0)"></div>
            </div>
            <div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
              <div class="text-[10px] text-slate-400 uppercase">Accounts</div>
              <div class="text-xs font-bold text-purple-600 dark:text-purple-400" x-text="dossierData?.summary?.accounts_count || 0"></div>
            </div>
          </div>

          <!-- Drawer Navigation Tabs -->
          <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 -mb-6 pb-2 text-xs">
            <button @click="dossierTab = 'pins'"
                    class="px-3 py-1.5 rounded-lg font-semibold transition"
                    :class="dossierTab === 'pins' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
              📌 Ranked Pins (<span x-text="dossierData?.ranked_pins?.length || 0"></span>)
            </button>
            <button @click="dossierTab = 'urls'"
                    class="px-3 py-1.5 rounded-lg font-semibold transition"
                    :class="dossierTab === 'urls' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
              🔗 Money Articles (<span x-text="dossierData?.money_urls?.length || 0"></span>)
            </button>
            <button @click="dossierTab = 'monopoly'"
                    class="px-3 py-1.5 rounded-lg font-semibold transition"
                    :class="dossierTab === 'monopoly' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
              🕸️ Keyword Monopoly (<span x-text="dossierData?.keyword_monopoly?.length || 0"></span>)
            </button>
            <button @click="dossierTab = 'accounts'"
                    class="px-3 py-1.5 rounded-lg font-semibold transition"
                    :class="dossierTab === 'accounts' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'">
              👤 Creators (<span x-text="dossierData?.accounts?.length || 0"></span>)
            </button>
          </div>
        </div>

        <!-- Drawer Content Body -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- Loading State -->
          <template x-if="dossierLoading">
            <div class="py-20 text-center text-slate-400 font-mono">
              <div class="inline-flex items-center gap-2">
                <span class="animate-spin text-lg">⏳</span>
                <span>Assembling forensic dossier...</span>
              </div>
            </div>
          </template>

          <template x-if="!dossierLoading && dossierData">
            <div>
              <!-- TAB 1: Ranked Pins -->
              <div x-show="dossierTab === 'pins'" class="space-y-3">
                <template x-for="p in dossierData.ranked_pins" :key="p.pin_id">
                  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-sky-500/50 transition">
                    <div class="flex items-center gap-3 min-w-0">
                      <img :src="p.image_url"
                           class="w-12 h-16 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0"
                           loading="lazy"
                           onerror="this.onerror=null; this.src='https://placehold.co/80x120?text=Pin'">
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-bold text-slate-900 dark:text-white truncate" x-text="p.title"></span>
                        <div class="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span x-text="'Pin #' + p.pin_id"></span>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <template x-if="p.creator_username">
                            <a :href="safeUrl('/?competitor=@' + p.creator_username)"
                               target="_blank"
                               class="text-purple-600 dark:text-purple-400 hover:underline"
                               :title="'Inspect creator @' + p.creator_username"
                               x-text="'@' + p.creator_username"></a>
                          </template>
                          <template x-if="!p.creator_username">
                            <span class="text-slate-400">Unknown</span>
                          </template>
                          <span class="text-slate-300 dark:text-slate-600">•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(p.saves) + ' saves'"></span>
                        </div>
                        <!-- SERP Appearances Badges (Clickable) -->
                        <div class="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <template x-for="app in (p.serp_appearances || []).slice(0, 4)" :key="app.keyword_id">
                            <a :href="safeUrl('/keywords/' + encodeURIComponent(app.keyword_name))"
                               target="_blank"
                               class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 transition-colors inline-flex items-center gap-1"
                               :title="'Open SERP Radar for: ' + app.keyword_name">
                              <span x-text="app.rank_position ? '#' + app.rank_position : 'Displaced'" class="font-bold"></span>
                              <span class="text-slate-500 dark:text-slate-400 truncate max-w-[130px]" x-text="app.keyword_name"></span>
                              <span class="text-[9px]">↗</span>
                            </a>
                          </template>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <a :href="safeUrl('/pin/' + p.pin_id)"
                         target="_blank"
                         class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition">
                        Inspect
                      </a>
                    </div>
                  </div>
                </template>
              </div>

              <!-- TAB 2: Money Articles & Multipliers -->
              <div x-show="dossierTab === 'urls'" class="space-y-4">
                <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div class="text-xs text-slate-500 font-mono" x-text="(dossierData.money_urls?.length || 0) + ' articles discovered'"></div>
                  <button @click="copyAllArticleUrls()"
                          class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold font-mono transition flex items-center gap-1 shadow-sm">
                    <span>📋</span> Copy All Article URLs
                  </button>
                </div>
                <template x-for="art in dossierData.money_urls" :key="art.clean_slug">
                  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold font-mono text-slate-900 dark:text-white truncate" x-text="art.clean_slug"></span>
                          <button @click="copyToClipboard(art.sample_url || art.clean_slug, 'Copied article URL!')"
                                  class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                  title="Copy URL">
                            📋
                          </button>
                          <a :href="safeUrl(art.sample_url)"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="text-xs text-sky-600 hover:underline shrink-0">
                            Open Article ↗
                          </a>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-mono text-slate-400 mt-1">
                          <span class="font-bold text-amber-600 dark:text-amber-400" x-text="art.pins_count + ' creative pins'"></span>
                          <span>•</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold" x-text="formatNumber(art.total_saves) + ' saves'"></span>
                          <template x-if="art.best_rank">
                            <span>•</span>
                            <span class="text-sky-600 dark:text-sky-400 font-bold" x-text="'Best Rank #' + art.best_rank"></span>
                          </template>
                        </div>
                      </div>
                    </div>

                    <!-- Creative Pin Variations Thumbnails Gallery -->
                    <div class="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <template x-for="p in art.pins" :key="p.pin_id">
                        <a :href="safeUrl('/pin/' + p.pin_id)"
                           target="_blank"
                           class="group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 aspect-[2/3]">
                          <img :src="p.image_url"
                               class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                               loading="lazy"
                               onerror="this.onerror=null; this.src='https://placehold.co/80x120?text=Pin'">
                          <div class="absolute bottom-0 inset-x-0 bg-slate-950/80 p-1 text-[9px] font-mono text-white flex items-center justify-between">
                            <span x-text="p.best_rank ? '#' + p.best_rank : '—'"></span>
                            <span class="text-emerald-400" x-text="p.saves + 's'"></span>
                          </div>
                        </a>
                      </template>
                    </div>
                  </div>
                </template>
              </div>

              <!-- TAB 3: Keyword Monopoly Matrix -->
              <div x-show="dossierTab === 'monopoly'" class="space-y-3">
                <template x-for="kw in dossierData.keyword_monopoly" :key="kw.keyword_id">
                  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-900 dark:text-white" x-text="kw.keyword_name"></span>
                        <a :href="safeUrl('/keywords/' + encodeURIComponent(kw.keyword_name))"
                           target="_blank"
                           class="text-[10px] text-sky-600 hover:underline font-mono">
                          SERP Radar ↗
                        </a>
                      </div>
                      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span class="text-[10px] font-mono font-bold text-slate-500 uppercase">Positions:</span>
                        <template x-for="r in kw.ranks" :key="r">
                          <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                                :class="r <= 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : (r <= 10 ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300')"
                                x-text="'#' + r"></span>
                        </template>
                      </div>
                    </div>

                    <div class="flex flex-col items-end shrink-0 font-mono text-xs">
                      <span class="font-bold text-sky-600 dark:text-sky-400" x-text="kw.active_slots + ' slots held'"></span>
                      <span class="text-[10px] text-emerald-600 dark:text-emerald-400" x-text="formatNumber(kw.total_saves) + ' saves'"></span>
                    </div>
                  </div>
                </template>
              </div>

              <!-- TAB 4: Associated Pinterest Accounts -->
              <div x-show="dossierTab === 'accounts'" class="space-y-3">
                <template x-for="acc in dossierData.accounts" :key="acc.username">
                  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-9 h-9 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold font-mono text-xs shrink-0">
                        @
                      </div>
                      <div class="flex flex-col min-w-0">
                        <a :href="safeUrl('https://pinterest.com/' + acc.username)"
                           target="_blank"
                           rel="noopener noreferrer"
                           class="text-xs font-bold text-slate-900 dark:text-white hover:text-sky-600 transition truncate"
                           x-text="'@' + acc.username"></a>
                        <div class="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span x-text="acc.pins_count + ' pins linked'"></span>
                          <span>•</span>
                          <span class="text-sky-600 dark:text-sky-400" x-text="acc.top10_count + ' top-10 slots'"></span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                      <div class="text-right font-mono text-xs">
                        <div class="font-bold text-emerald-600 dark:text-emerald-400" x-text="formatNumber(acc.total_saves)"></div>
                        <div class="text-[10px] text-slate-400">total saves</div>
                      </div>
                      <a :href="safeUrl('/?tab=competitors&action=track&creator=' + encodeURIComponent(acc.username))"
                         target="_blank"
                         class="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition">
                        + Track
                      </a>
                    </div>
                  </div>
                </template>
              </div>

            </div>
          </template>
        </div>

      </div>
    </div>
  </div>

  <!-- Client-Side Application Script -->
  <script>
    function domainsApp() {
      return {
        darkMode: localStorage.getItem('pa_theme') !== 'light',
        loading: false,
        domains: [],
        overview: {
          total_domains: 0,
          top5_monopoly_pct: 0,
          baby_giants_count: 0,
          multi_account_count: 0,
          avg_pins_per_url: 1.0
        },
        folders: [],
        totalDomains: 0,
        currentPage: 1,
        totalPages: 1,
        limit: 50,

        // Filters
        searchQuery: '',
        selectedFolderId: '',
        selectedPillar: 'all',
        activePreset: 'all',
        sortBy: 'visibility',
        excludeMarketplaces: true,

        // Deep Dossier Drawer State
        isDossierOpen: false,
        dossierDomain: '',
        dossierLoading: false,
        dossierData: null,
        dossierTab: 'pins', // 'pins' | 'urls' | 'monopoly' | 'accounts'

        // Age Verification & Batch Progress State
        enrichingDomains: {},
        batchEnriching: false,
        batchProgress: { done: 0, total: 0 },
        globalEnriching: false,
        globalStats: {
          total_domains: 0,
          checked_domains: 0,
          resolved_domains: 0,
          failed_domains: 0,
          unchecked_domains: 0,
          percent_complete: 0
        },

        toasts: [],

        init() {
          this.fetchFolders();
          this.loadDomains();
          this.fetchGlobalEnrichStatus();
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('pa_theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('pa_theme', 'light');
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

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || s.startsWith('/')) return s;
          return '#';
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        formatNumber(num) {
          if (num === null || num === undefined) return '0';
          const n = Number(num);
          if (isNaN(n)) return '0';
          return n.toLocaleString();
        },

        async fetchFolders() {
          try {
            const res = await fetch('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.folders = Array.isArray(data.folders) ? data.folders : (Array.isArray(data) ? data : []);
            }
          } catch (_) {}
        },

        async loadDomains(resetPage = false) {
          if (resetPage) this.currentPage = 1;
          this.loading = true;

          const params = new URLSearchParams({
            page: String(this.currentPage),
            limit: String(this.limit),
            sort: this.sortBy,
            preset: this.activePreset,
            pillar: this.selectedPillar,
            exclude_marketplaces: String(this.excludeMarketplaces)
          });

          if (this.searchQuery.trim()) {
            params.set('search', this.searchQuery.trim());
          }
          if (this.selectedFolderId) {
            params.set('folder_id', this.selectedFolderId);
          }

          try {
            const res = await fetch('/api/domains?' + params.toString());
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            this.domains = data.domains || [];
            this.overview = data.overview || this.overview;
            this.totalDomains = data.total || 0;
            this.totalPages = data.total_pages || 1;
          } catch (err) {
            this.showToast('Failed to load domains: ' + err.message, 'error');
          } finally {
            this.loading = false;
          }
        },

        setPreset(preset) {
          this.activePreset = preset;
          this.loadDomains(true);
        },

        applySearch() {
          this.loadDomains(true);
        },

        resetFilters() {
          this.searchQuery = '';
          this.selectedFolderId = '';
          this.selectedPillar = 'all';
          this.activePreset = 'all';
          this.sortBy = 'visibility';
          this.excludeMarketplaces = true;
          this.loadDomains(true);
        },

        changePage(p) {
          if (p < 1 || p > this.totalPages) return;
          this.currentPage = p;
          this.loadDomains();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        async enrichAge(domain, force = false) {
          if (!domain || this.enrichingDomains[domain]) return;
          this.enrichingDomains[domain] = true;
          this.enrichingDomains = { ...this.enrichingDomains };
          try {
            const res = await fetch('/api/domains/enrich-age', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, force })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.age_info) {
                const target = this.domains.find(d => d.domain === domain);
                if (target) {
                  target.age_years = data.age_info.age_years;
                  target.age_days = data.age_info.age_days;
                  target.domain_created_at = data.age_info.registered_at;
                  target.age_status = data.age_info.lookup_status;
                  target.lookup_source = data.age_info.lookup_source;
                }
                if (this.dossierData && this.dossierDomain === domain) {
                  this.dossierData.age_info = data.age_info;
                }
                const ageLabel = data.age_info.age_years != null ? data.age_info.age_years + 'y' : 'Checked';
                this.showToast('Resolved ' + domain + ': ' + ageLabel + ' (' + (data.age_info.lookup_source || 'whois') + ')', 'success');
              }
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to check age for ' + domain + ': ' + err.message, 'error');
          } finally {
            delete this.enrichingDomains[domain];
            this.enrichingDomains = { ...this.enrichingDomains };
          }
        },

        async batchEnrichVisible() {
          const unchecked = this.domains.filter(d => (!d.age_status || d.age_status === 'unchecked') && !this.enrichingDomains[d.domain]);
          if (unchecked.length === 0) {
            this.showToast('All visible domains on this page are already checked (resolved or privacy-shielded)!', 'info');
            return;
          }
          this.batchEnriching = true;
          this.batchProgress = { done: 0, total: unchecked.length };
          this.showToast('Verifying ' + unchecked.length + ' visible domains in batch...', 'info');

          // Chunk into batches of 8 with safe jitter
          const chunks = [];
          for (let i = 0; i < unchecked.length; i += 8) {
            chunks.push(unchecked.slice(i, i + 8).map(d => d.domain));
          }

          for (const chunk of chunks) {
            chunk.forEach(d => { this.enrichingDomains[d] = true; });
            this.enrichingDomains = { ...this.enrichingDomains };
            try {
              const res = await fetch('/api/domains/enrich-age', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: chunk })
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.results)) {
                  for (const r of data.results) {
                    const target = this.domains.find(d => d.domain === r.domain);
                    if (target) {
                      target.age_years = r.age_years;
                      target.age_days = r.age_days;
                      target.domain_created_at = r.registered_at;
                      target.age_status = r.lookup_status;
                      target.lookup_source = r.lookup_source;
                    }
                  }
                }
              }
            } catch (_) {}
            chunk.forEach(d => { delete this.enrichingDomains[d]; });
            this.batchProgress.done = Math.min(this.batchProgress.total, this.batchProgress.done + chunk.length);
            this.enrichingDomains = { ...this.enrichingDomains };
          }

          this.batchEnriching = false;
          this.fetchGlobalEnrichStatus();
          this.showToast('Batch verification complete! Updated ' + this.batchProgress.done + ' domains.', 'success');
        },

        async fetchGlobalEnrichStatus() {
          try {
            const res = await fetch('/api/domains/enrich-status');
            if (res.ok) {
              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }
            }
          } catch (_) {}
        },

        toggleGlobalEnrichment() {
          if (this.globalEnriching) {
            this.stopGlobalEnrichment();
          } else {
            this.startGlobalEnrichment();
          }
        },

        async startGlobalEnrichment() {
          if (this.globalEnriching) return;
          this.globalEnriching = true;
          this.showToast('Starting automated database verification...', 'info');

          try {
            await this.fetchGlobalEnrichStatus();
            if (this.globalStats.unchecked_domains === 0) {
              this.showToast('All domains in the database are already verified!', 'success');
              this.globalEnriching = false;
              return;
            }

            while (this.globalEnriching) {
              const res = await fetch('/api/domains/enrich-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_size: 25, concurrency: 4 })
              });

              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }

              // Update any currently visible rows on screen in real time
              if (Array.isArray(data.results)) {
                for (const r of data.results) {
                  const target = this.domains.find(d => d.domain === r.domain);
                  if (target) {
                    target.age_years = r.age_years;
                    target.age_days = r.age_days;
                    target.domain_created_at = r.registered_at;
                    target.age_status = r.lookup_status;
                    target.lookup_source = r.lookup_source;
                  }
                }
              }

              if (data.is_complete || (this.globalStats.unchecked_domains === 0)) {
                this.globalEnriching = false;
                this.showToast('🎉 All domains in database are fully verified!', 'success');
                break;
              }

              // Small delay between batches to respect rate limits
              await new Promise(r => setTimeout(r, 600));
            }
          } catch (err) {
            this.globalEnriching = false;
            this.showToast('Global verification paused: ' + err.message, 'error');
          }
        },

        stopGlobalEnrichment() {
          this.globalEnriching = false;
          this.showToast('Global verification paused. You can resume anytime.', 'info');
        },

        async openDossier(domain) {
          this.dossierDomain = domain;
          this.isDossierOpen = true;
          this.dossierLoading = true;
          this.dossierData = null;
          this.dossierTab = 'pins';

          try {
            const res = await fetch('/api/domains/dossier?domain=' + encodeURIComponent(domain));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.dossierData = await res.json();
          } catch (err) {
            this.showToast('Failed to load dossier: ' + err.message, 'error');
          } finally {
            this.dossierLoading = false;
          }
        },

        closeDossier() {
          this.isDossierOpen = false;
          this.dossierData = null;
        },

        async recheckAgeForDossier() {
          if (!this.dossierDomain) return;
          await this.enrichAge(this.dossierDomain, true);
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
            this.showToast(msg, 'success');
          }).catch(() => {
            this.showToast('Could not copy to clipboard', 'warning');
          });
        },

        copyAllArticleUrls() {
          if (!this.dossierData?.money_urls?.length) {
            this.showToast('No articles available to copy', 'warning');
            return;
          }
          const urls = this.dossierData.money_urls.map(u => u.sample_url || ('https://' + this.dossierDomain + u.clean_slug)).join('\\n');
          this.copyToClipboard(urls, 'Copied ' + this.dossierData.money_urls.length + ' article URLs to clipboard!');
        },

        downloadDomainsCsv() {
          if (!this.domains || this.domains.length === 0) {
            this.showToast('No domains available to export', 'warning');
            return;
          }

          const headers = [
            'domain',
            'age_years',
            'age_days',
            'domain_created_at',
            'total_pins',
            'unique_urls',
            'pins_per_url',
            'active_serp_pins',
            'top3_pins',
            'top10_pins',
            'displaced_pins',
            'decay_rate_pct',
            'visibility_score',
            'arbitrage_score',
            'total_saves',
            'avg_velocity',
            'accounts_count'
          ];

          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...this.domains.map(d => headers.map(h => this.sanitizeCsvCell(d[h])).join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'domain_intelligence_' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Exported domains CSV!', 'success');
        }
      };
    }
  </script>
</body>
</html>`;
}
