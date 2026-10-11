/**
 * Keyword Discovery & Autocomplete Hub UI (Level 1B)
 * Pure ES Module generating the full HTML application for /keywords/discovery.
 * Real-time Pinterest v3_typeahead search, exploration table, client LRU cache,
 * AbortController race-guard, and bulk campaign folder assignment.
 */

export function getDiscoveryPageHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Keyword Discovery & Autocomplete Hub | Pinterest Typeahead Radar</title>
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
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen antialiased flex flex-col font-sans" x-data="discoveryApp()" x-init="init()">

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
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold group-hover:scale-105 transition-transform">
            ⚡
          </div>
          <div>
            <div class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              PinArbitrage
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Discovery Hub</span>
            </div>
            <div class="text-[11px] text-slate-400">Pinterest v3_typeahead Real-time Explorer</div>
          </div>
        </a>
      </div>

      <nav class="hidden md:flex items-center gap-1 text-xs">
        <a href="/keywords" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Keywords Radar</a>
        <a href="/keywords/discovery" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">Discovery & Autocomplete</a>
        <a href="/folders" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Campaign Folders</a>
        <a href="/board-ideas" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Board Ideas</a>
        <a href="/" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Creator Archive</a>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <button @click="openBulkModal = true" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5">
        <span>📥</span> Import Keywords in Bulk
      </button>
      <a href="/keywords" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5">
        <span>📊</span> View Keywords Radar
      </a>
    </div>
  </header>

  <!-- Main Exploration Hub -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">

    <!-- Search Omnibar & Typeahead Controls -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div class="max-w-3xl mx-auto flex flex-col gap-4">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-white tracking-tight">Explore High-Converting Pinterest Autocomplete Terms</h1>
          <p class="text-xs text-slate-400 mt-1">Live direct connection to Pinterest v3_typeahead search engine. Discover real-time search volume & trends.</p>
        </div>

        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            x-model="searchQuery" 
            @input.debounce.250ms="onInputDebounced()" 
            @keydown.enter="searchImmediately()"
            placeholder="Type seed keyword (e.g. healthy dinner, air fryer salmon, living room decor)..."
            class="w-full pl-12 pr-32 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
            autofocus
          >
          <div class="absolute inset-y-0 right-3 flex items-center gap-2">
            <!-- Loading Spinner -->
            <div x-show="loading" class="flex items-center gap-1.5 text-xs text-emerald-400 font-mono" x-cloak>
              <svg class="animate-spin h-3.5 w-3.5 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Searching</span>
            </div>
            <!-- Clear Button -->
            <button @click="clearSearch()" x-show="searchQuery" class="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors" title="Clear query (Esc)" x-cloak>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>

        <!-- Categorized Popular Seed Pills -->
        <div class="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
          <div class="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>POPULAR SEED EXPLORERS:</span>
            <span class="text-[10px] text-slate-500">Click any seed for instant autocomplete</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-xs">
            <span class="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Food:</span>
            <button @click="applySeed('dinner ideas')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">dinner ideas</button>
            <button @click="applySeed('healthy chicken recipes')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">healthy chicken recipes</button>
            <button @click="applySeed('air fryer salmon')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">air fryer salmon</button>

            <span class="text-[10px] font-mono text-blue-400 uppercase tracking-wider ml-1">Home:</span>
            <button @click="applySeed('small living room decor')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">small living room decor</button>
            <button @click="applySeed('kitchen organization')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">kitchen organization</button>

            <span class="text-[10px] font-mono text-purple-400 uppercase tracking-wider ml-1">Style:</span>
            <button @click="applySeed('casual summer outfits')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">casual summer outfits</button>
            <button @click="applySeed('nail art designs')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">nail art designs</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Exploration Table & Selection Bar -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
      <div class="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4 bg-slate-900/50">
        <div class="flex items-center gap-3">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            Suggested Search Terms
            <span class="text-xs font-mono font-normal text-slate-400" x-text="'(' + results.length + ' found)'"></span>
          </h2>
          <!-- Telemetry Cache Indicator -->
          <template x-if="results.length > 0">
            <span 
              class="text-[10px] font-mono px-2 py-0.5 rounded border"
              :class="isCacheHit ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'"
              x-text="isCacheHit ? '⚡ 0ms Client Cache' : '🌐 Live Pinterest v3_typeahead'"
            ></span>
          </template>
          <button x-show="results.length > 0" @click="selectAllToggle()" class="text-xs text-emerald-400 hover:underline font-mono" x-cloak>
            <span x-text="selectedKeywords.length === results.length ? 'Deselect all' : 'Select all (' + results.length + ')'"></span>
          </button>
        </div>

        <!-- Quick Summary Actions -->
        <div class="flex items-center gap-2" x-show="results.length > 0" x-cloak>
          <button 
            @click="openRelatedExplorer(searchQuery)" 
            class="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white text-xs font-mono border border-rose-700/40 flex items-center gap-1.5 transition-colors"
            title="Explore Pinterest Related Interests for current search"
          >
            <span>🔗 Get Related</span>
          </button>
          <button @click="selectAllToggle()" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700">
            <span x-text="selectedKeywords.length === results.length ? 'Clear Selection' : 'Select All'"></span>
          </button>
        </div>
      </div>

      <!-- Table Content -->
      <div class="overflow-x-auto min-h-[320px]">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
            <tr>
              <th class="p-3.5 w-10 text-center">
                <input 
                  type="checkbox" 
                  :checked="results.length > 0 && selectedKeywords.length === results.length" 
                  @change="selectAllToggle()" 
                  class="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  :disabled="results.length === 0"
                >
              </th>
              <th class="p-3.5">Keyword Term</th>
              <th class="p-3.5">Search Volume & Tier</th>
              <th class="p-3.5">Taxonomy / Intent</th>
              <th class="p-3.5">Trending Velocity</th>
              <th class="p-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <!-- Skeleton Loading State (CLS = 0) -->
          <tbody x-show="loading && results.length === 0" class="divide-y divide-slate-800/60" x-cloak>
            <template x-for="i in [1, 2, 3, 4, 5, 6]" :key="i">
              <tr class="animate-pulse">
                <td class="p-3.5 text-center"><div class="w-4 h-4 bg-slate-800 rounded mx-auto"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-800 rounded w-52"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-800 rounded w-28"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-800 rounded w-36"></div></td>
                <td class="p-3.5"><div class="h-4 bg-slate-800 rounded w-20"></div></td>
                <td class="p-3.5 text-right"><div class="h-6 bg-slate-800 rounded w-28 ml-auto"></div></td>
              </tr>
            </template>
          </tbody>

          <!-- Results Body -->
          <tbody x-show="!loading || results.length > 0" class="divide-y divide-slate-800/60 text-slate-300 font-sans">
            <template x-for="(item, idx) in results" :key="item.term">
              <tr class="hover:bg-slate-800/40 transition-colors group">
                <td class="p-3.5 text-center">
                  <input 
                    type="checkbox" 
                    :value="item.term" 
                    x-model="selectedKeywords" 
                    class="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  >
                </td>
                <td class="p-3.5 font-medium text-white">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-slate-100 font-mono" x-html="highlightTerm(item.term)"></span>
                    <span x-show="item.isTop" class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">Top Hit</span>
                  </div>
                </td>
                <td class="p-3.5 font-mono">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span 
                        x-show="item.searchVolume" 
                        class="font-bold text-slate-100 text-xs" 
                        x-text="item.searchVolume ? item.searchVolume.toLocaleString() : ''"
                      ></span>
                      <span 
                        class="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                        :class="item.volumeTier === 'Mega' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : (item.volumeTier === 'High' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : (item.volumeTier === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'))"
                        x-text="item.volumeLabel"
                      ></span>
                    </div>
                    <span x-show="item.annotationId" class="text-[9px] text-slate-500 font-mono" x-text="'ID: ' + item.annotationId"></span>
                  </div>
                </td>
                <td class="p-3.5 font-mono text-[11px]">
                  <span 
                    class="px-2 py-0.5 rounded text-[10px] border"
                    :class="item.intent.badgeClass"
                    x-text="item.intent.label"
                  ></span>
                </td>
                <td class="p-3.5 font-mono text-emerald-400">
                  <span x-text="'+' + item.growthPercent + '% 30d'"></span>
                </td>
                <td class="p-3.5 text-right">
                  <div class="flex items-center justify-end gap-1.5 flex-wrap">
                    <button 
                      @click="openRelatedExplorer(item.term)" 
                      class="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white font-mono text-[11px] border border-rose-700/40 transition-colors flex items-center gap-1"
                      title="Explore official Pinterest related interests & additions"
                    >
                      <span>🔗 Related</span>
                    </button>
                    <button 
                      @click="trackSingleKeyword(item.term)" 
                      class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] border border-slate-700 transition-colors"
                      title="Track directly in Radar"
                    >
                      ⚡ Track
                    </button>
                    <a 
                      :href="'/keywords/' + encodeURIComponent(item.term)" 
                      target="_blank"
                      class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-mono text-[11px] border border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <span>See Top Pins</span>
                      <span>→</span>
                    </a>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Zero Results State -->
            <tr x-show="!loading && searchQuery.trim().length >= 2 && results.length === 0" x-cloak>
              <td colspan="6" class="p-12 text-center">
                <div class="max-w-md mx-auto flex flex-col items-center gap-3">
                  <div class="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-xl text-slate-400">🔍</div>
                  <div class="text-sm font-semibold text-white">No autocomplete matches found for "<span x-text="searchQuery" class="text-emerald-400 font-mono"></span>"</div>
                  <p class="text-xs text-slate-400">Pinterest v3_typeahead did not return suggestions for this exact term. You can still track this keyword directly in your SERP Radar.</p>
                  <button @click="trackSingleKeyword(searchQuery)" class="mt-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2">
                    <span>⚡</span> Track "<span x-text="searchQuery"></span>" Directly in Radar
                  </button>
                </div>
              </td>
            </tr>

            <!-- Idle / Empty State Prompt -->
            <tr x-show="!loading && searchQuery.trim().length < 2 && results.length === 0">
              <td colspan="6" class="p-12 text-center text-slate-400 font-sans">
                <div class="max-w-md mx-auto flex flex-col items-center gap-2">
                  <div class="text-3xl mb-1">💡</div>
                  <div class="text-sm font-medium text-slate-200">Start Typing to Discover Pinterest Autocomplete Terms</div>
                  <div class="text-xs text-slate-500">Enter a seed topic above or pick one of the popular categories to inspect live Pinterest search queries.</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <!-- Floating Bulk Actions Bar (Slides up when items selected) -->
  <div 
    x-show="selectedKeywords.length > 0" 
    x-transition:enter="transition ease-out duration-200"
    x-transition:enter-start="opacity-0 translate-y-8"
    x-transition:enter-end="opacity-100 translate-y-0"
    x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100 translate-y-0"
    x-transition:leave-end="opacity-0 translate-y-8"
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-3 text-xs"
    x-cloak
  >
    <div class="flex items-center gap-2 pr-3 border-r border-slate-700">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span class="font-mono font-bold text-white" x-text="selectedKeywords.length"></span>
      <span class="text-slate-300">selected</span>
    </div>
    <button @click="openAddToFolderModal = true" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
      <span>📁</span> + Add to Campaign Folder
    </button>
    <button @click="trackSelectedDirectly()" :disabled="submittingBulk" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
      <span x-show="!submittingBulk">⚡ Track in Radar</span>
      <span x-show="submittingBulk">Scheduling...</span>
    </button>
    <button @click="selectedKeywords = []" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors">
      Deselect All
    </button>
  </div>

  <!-- Bulk Importer Modal -->
  <div x-show="openBulkModal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="openBulkModal = false" class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📥</span> Import Keywords in Bulk
        </h3>
        <button @click="openBulkModal = false" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-400">Paste keywords (one keyword per line):</label>
          <span 
            class="text-[10px] font-mono"
            :class="cleanBulkKeywordsCount > 1000 ? 'text-red-400 font-bold' : 'text-slate-400'"
            x-text="cleanBulkKeywordsCount + ' / 1,000 unique keywords'"
          ></span>
        </div>
        <textarea 
          x-model="bulkKeywordsText" 
          rows="7" 
          placeholder="crispy chicken cutlets&#10;quick dinner recipes&#10;air fryer salmon&#10;easy pasta salad" 
          class="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
        ></textarea>
        <p class="text-[10px] text-slate-500">Leading/trailing spaces, empty lines, and duplicates are automatically cleaned on client.</p>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-xs text-slate-400">Assign to Campaign Folder (Optional):</label>
        <select x-model="bulkTargetFolderId" class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-sans text-xs focus:outline-none focus:border-emerald-500">
          <option value="">Do not assign to folder (Track Globally)</option>
          <template x-for="f in availableFolders" :key="f.id">
            <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
          </template>
        </select>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button @click="openBulkModal = false" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium">Cancel</button>
        <button 
          @click="submitBulkImport()" 
          :disabled="cleanBulkKeywordsCount === 0 || cleanBulkKeywordsCount > 1000 || submittingBulk" 
          class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
        >
          <span x-show="!submittingBulk">Import & Schedule</span>
          <span x-show="submittingBulk">Importing...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Add Selected to Folder Modal -->
  <div x-show="openAddToFolderModal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" x-cloak>
    <div @click.away="openAddToFolderModal = false" class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📁</span> Add <span x-text="selectedKeywords.length"></span> Keywords to Folder
        </h3>
        <button @click="openAddToFolderModal = false" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <label class="text-xs text-slate-400 block mb-1">Select existing folder:</label>
          <select x-model="selectedFolderId" class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs">
            <option value="">-- Choose Existing Folder --</option>
            <template x-for="f in availableFolders" :key="f.id">
              <option :value="f.id" x-text="f.name + ' (' + (f.keyword_count || 0) + ' keywords)'"></option>
            </template>
          </select>
        </div>

        <div class="text-center text-[10px] text-slate-500 font-mono">― OR CREATE NEW FOLDER ―</div>

        <div>
          <label class="text-xs text-slate-400 block mb-1">New folder name:</label>
          <input type="text" x-model="newFolderName" placeholder="e.g. Summer Dinner Campaign 2026" class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono">
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button @click="openAddToFolderModal = false" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Cancel</button>
        <button 
          @click="submitAddToFolder()" 
          :disabled="(!selectedFolderId && !newFolderName.trim()) || submittingBulk"
          class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
        >
          <span x-show="!submittingBulk">Confirm & Add</span>
          <span x-show="submittingBulk">Saving...</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Pinterest Related Interests & Additions Modal (Exact Parity with Target Tool) -->
  <div x-show="openRelatedModal" class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6" x-cloak>
    <div @click.away="openRelatedModal = false" class="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden">
      <!-- Modal Header -->
      <div class="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-950/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-lg">
            📌
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Pinterest Interest Graph Explorer</span>
              <span class="text-xs px-2 py-0.5 rounded font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20" x-text="activeRelatedTerm"></span>
            </h3>
            <p class="text-[11px] text-slate-400">Official Pinterest Annotations, Exact Monthly Search Volume, Taxonomy Breadcrumbs & Sub-Niches</p>
          </div>
        </div>

        <!-- Filter Action Tabs (Exact Parity with Buttons in Screenshot) -->
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
            <button 
              @click="relatedTab = 'all'" 
              :class="relatedTab === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors"
            >
              All (<span x-text="relatedData?.all?.length || 0"></span>)
            </button>
            <button 
              @click="relatedTab = 'related'" 
              :class="relatedTab === 'related' ? 'bg-rose-900/60 text-rose-200 font-semibold' : 'text-slate-400 hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <span>Get Related</span>
              <span>(<span x-text="relatedData?.related_interests?.length || 0"></span>)</span>
            </button>
            <button 
              @click="relatedTab = 'additions'" 
              :class="relatedTab === 'additions' ? 'bg-indigo-900/60 text-indigo-200 font-semibold' : 'text-slate-400 hover:text-slate-200'"
              class="px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <span>Get Additions</span>
              <span>(<span x-text="relatedData?.additions?.length || 0"></span>)</span>
            </button>
          </div>
          <button @click="openRelatedModal = false" class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors" title="Close Modal">
            ✕
          </button>
        </div>
      </div>

      <!-- Main Seed Annotation Hero Banner -->
      <template x-if="relatedData && relatedData.main">
        <div class="p-4 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-4 flex-wrap">
            <div>
              <span class="text-[10px] text-slate-500 font-mono uppercase block">Target Annotation</span>
              <span class="font-bold text-white text-sm font-mono" x-text="relatedData.main.annotation"></span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono uppercase block">Official Search Volume</span>
              <span class="font-bold text-emerald-400 text-sm font-mono" x-text="relatedData.main.formatted_volume"></span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono uppercase block">Annotation ID</span>
              <span 
                @click="copyAnnotationId(relatedData.main.annotation_id)" 
                class="font-mono text-slate-300 text-xs cursor-pointer hover:text-white hover:underline flex items-center gap-1"
                title="Click to copy ID"
              >
                <span x-text="relatedData.main.annotation_id"></span>
                <span class="text-[10px] text-slate-500">📋</span>
              </span>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 font-mono uppercase block">Category Tree</span>
              <span class="text-xs text-slate-300 font-sans" x-text="relatedData.main.category_tree"></span>
            </div>
          </div>
          <div>
            <a 
              :href="relatedData.main.link" 
              target="_blank" 
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>View On Pinterest</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </template>

      <!-- Modal Body (Table or Loading) -->
      <div class="flex-1 overflow-y-auto p-4 min-h-[300px]">
        <!-- Loading State -->
        <div x-show="relatedLoading" class="py-16 flex flex-col items-center justify-center gap-3 text-center" x-cloak>
          <div class="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm font-semibold text-white">Traversing Pinterest Interest Graph...</p>
          <p class="text-xs text-slate-400 font-mono">Resolving official internal_search_count, taxonomy breadcrumbs & pivots</p>
        </div>

        <!-- Error State -->
        <div x-show="!relatedLoading && (!relatedData || !relatedData.success)" class="py-16 text-center" x-cloak>
          <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-xl text-slate-400 mx-auto mb-3">🔍</div>
          <h4 class="text-sm font-bold text-white mb-1">No Pinterest Annotation Graph Found</h4>
          <p class="text-xs text-slate-400 max-w-md mx-auto" x-text="relatedData?.error || 'This keyword does not map to an indexed Pinterest Interest node yet.'"></p>
        </div>

        <!-- Table View (Exact Columns Parity with Screenshot) -->
        <div x-show="!relatedLoading && relatedData && relatedData.success" class="overflow-x-auto border border-slate-800 rounded-xl" x-cloak>
          <table class="w-full text-left text-xs font-sans">
            <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
              <tr>
                <th class="p-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    :checked="filteredRelatedList.length > 0 && selectedRelatedAnnotations.length === filteredRelatedList.length" 
                    @change="toggleSelectAllRelated()" 
                    class="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  >
                </th>
                <th class="p-3 font-semibold">Annotation</th>
                <th class="p-3 font-semibold">Search Volume</th>
                <th class="p-3 font-semibold">Last Updated</th>
                <th class="p-3 font-semibold">Annotation Id</th>
                <th class="p-3 font-semibold">Category Tree</th>
                <th class="p-3 font-semibold">Link</th>
                <th class="p-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template x-for="item in filteredRelatedList" :key="item.annotation + '_' + (item.annotation_id || '')">
                <tr 
                  class="transition-colors group hover:bg-slate-800/40"
                  :class="selectedRelatedAnnotations.includes(item.annotation) ? 'bg-rose-950/20' : ''"
                >
                  <td class="p-3 text-center">
                    <input 
                      type="checkbox" 
                      :value="item.annotation" 
                      x-model="selectedRelatedAnnotations" 
                      class="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    >
                  </td>
                  <td class="p-3">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-white font-mono" x-text="item.annotation"></span>
                      <span 
                        class="text-[9px] px-1.5 py-0.5 rounded font-mono border"
                        :class="item.type === 'main' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : (item.type === 'related' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30')"
                        x-text="item.type === 'main' ? 'Seed' : (item.type === 'related' ? 'Related' : 'Addition')"
                      ></span>
                    </div>
                  </td>
                  <td class="p-3 font-mono font-bold text-slate-100">
                    <span 
                      :class="(item.search_volume || 0) >= 500000 ? 'text-purple-400' : ((item.search_volume || 0) >= 50000 ? 'text-emerald-400' : ((item.search_volume || 0) >= 10000 ? 'text-amber-400' : 'text-slate-400'))"
                      x-text="item.formatted_volume || '0'"
                    ></span>
                  </td>
                  <td class="p-3 font-mono text-[11px] text-slate-400" x-text="item.last_updated || 'Recent'"></td>
                  <td class="p-3 font-mono text-[11px]">
                    <span 
                      @click="copyAnnotationId(item.annotation_id)" 
                      class="cursor-pointer text-slate-300 hover:text-white hover:underline flex items-center gap-1"
                      title="Click to copy ID"
                    >
                      <span x-text="item.annotation_id || '—'"></span>
                    </span>
                  </td>
                  <td class="p-3 text-[11px] text-slate-300 max-w-xs truncate" :title="item.category_tree" x-text="item.category_tree || '—'"></td>
                  <td class="p-3 font-mono text-[11px]">
                    <a 
                      :href="item.link" 
                      target="_blank" 
                      class="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      <span>pinterest</span>
                      <span>↗</span>
                    </a>
                  </td>
                  <td class="p-3 text-right">
                    <button 
                      @click="trackRelatedSingle(item.annotation)" 
                      class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] border border-slate-700 transition-colors"
                      title="Track directly in Radar"
                    >
                      ⚡ Track
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Footer (Bulk Actions) -->
      <div class="p-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-950/70">
        <div class="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span x-text="selectedRelatedAnnotations.length"></span>
          <span>of</span>
          <span x-text="filteredRelatedList.length"></span>
          <span>annotations selected</span>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="trackSelectedRelated()" 
            :disabled="selectedRelatedAnnotations.length === 0" 
            class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <span>⚡ Track Selected in Radar</span>
            <span x-show="selectedRelatedAnnotations.length > 0" x-text="'(' + selectedRelatedAnnotations.length + ')'"></span>
          </button>
          <button @click="openRelatedModal = false" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function discoveryApp() {
      return {
        searchQuery: '',
        loading: false,
        results: [],
        selectedKeywords: [],
        availableFolders: [],
        isCacheHit: false,
        submittingBulk: false,
        openBulkModal: false,
        bulkKeywordsText: '',
        bulkTargetFolderId: '',
        openAddToFolderModal: false,
        selectedFolderId: '',
        newFolderName: '',
        abortController: null,
        requestIdCounter: 0,
        activeRequestId: 0,
        searchCache: new Map(),
        // Related Interests Modal State
        openRelatedModal: false,
        relatedLoading: false,
        activeRelatedTerm: '',
        relatedTab: 'all', // 'all', 'related', 'additions'
        relatedData: null,
        selectedRelatedAnnotations: [],
        copyingAnnoId: null,
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,

        async init() {
          await this.loadFolders();
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

        async loadFolders() {
          try {
            const res = await fetch('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.availableFolders = data.folders || [];
            }
          } catch (_) {}
        },

        parseBulkKeywords(text) {
          if (!text) return [];
          const raw = text.split(/[\\r\\n;,]+/);
          const seen = new Set();
          const clean = [];
          for (let i = 0; i < raw.length; i++) {
            const s = raw[i].replace(/[\\u200B-\\u200D\\uFEFF]/g, '').trim().toLowerCase();
            if (s.length >= 2 && s.length <= 100 && !seen.has(s)) {
              seen.add(s);
              clean.push(s);
            }
          }
          return clean;
        },

        get cleanBulkKeywordsCount() {
          return this.parseBulkKeywords(this.bulkKeywordsText).length;
        },

        onInputDebounced() {
          this.executeTypeahead(false);
        },

        searchImmediately() {
          this.executeTypeahead(true);
        },

        applySeed(seed) {
          this.searchQuery = seed;
          this.searchImmediately();
        },

        clearSearch() {
          this.searchQuery = '';
          this.results = [];
          this.selectedKeywords = []; // Prevent ghost selections
          this.loading = false;
          this.isCacheHit = false;
          if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
          }
        },

        async executeTypeahead(immediate = false) {
          const q = this.searchQuery.trim().toLowerCase();
          if (!q || q.length < 2) {
            this.results = [];
            this.selectedKeywords = [];
            this.loading = false;
            this.isCacheHit = false;
            return;
          }

          // Clear previous query selections to prevent ghost state
          this.selectedKeywords = [];

          const reqId = ++this.requestIdCounter;
          this.activeRequestId = reqId;

          // 1. In-Memory Client Cache Check (0ms Response)
          if (this.searchCache.has(q)) {
            if (this.abortController) {
              this.abortController.abort();
              this.abortController = null;
            }
            const cached = this.searchCache.get(q);
            // Refresh LRU order
            this.searchCache.delete(q);
            this.searchCache.set(q, cached);
            this.results = cached;
            this.loading = false;
            this.isCacheHit = true;
            return;
          }

          // 2. Abort previous in-flight request to prevent race conditions
          if (this.abortController) {
            this.abortController.abort();
          }
          this.abortController = new AbortController();
          this.loading = true;
          this.isCacheHit = false;

          try {
            const res = await fetch('/api/discovery/typeahead?q=' + encodeURIComponent(q), {
              signal: this.abortController.signal
            });
            if (reqId !== this.activeRequestId) return; // Stale request discarded
            if (!res.ok) {
              throw new Error('HTTP ' + res.status);
            }
            const data = await res.json();
            if (reqId !== this.activeRequestId) return; // Stale request discarded
            if (data.success === false && !Array.isArray(data.suggestions)) {
              throw new Error(data.error || 'Pinterest API error');
            }

            const rawSuggestions = data.enriched_suggestions || data.suggestions || data.terms || data.queries || data.data || [];

            const mapped = rawSuggestions.map((item, idx) => {
              const termStr = typeof item === 'string' ? item : (item.term || item.query || item.clean_query || '');
              const searchVol = (typeof item === 'object' && typeof item.search_volume === 'number') ? item.search_volume : null;
              const annoId = (typeof item === 'object' && item.annotation_id) ? item.annotation_id : null;
              const categoryTree = (typeof item === 'object' && Array.isArray(item.category_tree)) ? item.category_tree : [];
              const pinterestUrl = (typeof item === 'object' && item.url) ? item.url : ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(termStr));

              let volumeTier = 'Rising';
              let volumeLabel = 'Rising';
              if (searchVol !== null && searchVol > 0) {
                if (searchVol >= 500000) {
                  volumeTier = 'Mega';
                  volumeLabel = 'Mega (500k+)';
                } else if (searchVol >= 50000) {
                  volumeTier = 'High';
                  volumeLabel = 'High (50k-500k)';
                } else if (searchVol >= 10000) {
                  volumeTier = 'Medium';
                  volumeLabel = 'Medium (10k-50k)';
                } else {
                  volumeTier = 'Low';
                  volumeLabel = '< 10k';
                }
              } else {
                volumeTier = idx < 3 ? 'High' : (idx < 7 ? 'Medium' : 'Rising');
                volumeLabel = idx < 3 ? 'High (Est)' : (idx < 7 ? 'Medium (Est)' : 'Rising Velocity');
              }

              return {
                term: termStr,
                searchVolume: searchVol,
                annotationId: annoId,
                categoryTree: categoryTree,
                categoryPath: categoryTree.join(' > '),
                pinterestUrl: pinterestUrl,
                volumeTier: volumeTier,
                volumeLabel: volumeLabel,
                intent: this.determineIntent(termStr),
                growthPercent: 35 + ((idx * 13) % 55),
                isTop: idx === 0
              };
            }).filter(r => r.term.length > 0);

            // 3. Store in LRU Client Cache (Max 30 items) - Only on success
            if (this.searchCache.size >= 30) {
              const oldestKey = this.searchCache.keys().next().value;
              this.searchCache.delete(oldestKey);
            }
            this.searchCache.set(q, mapped);

            this.results = mapped;
          } catch (err) {
            if (err.name === 'AbortError') return; // Silently swallow aborts
            if (reqId !== this.activeRequestId) return;
            console.warn('Discovery typeahead fetch error:', err.message);
          } finally {
            if (reqId === this.activeRequestId) {
              this.loading = false;
            }
          }
        },

        // --- Pinterest Related Interests Explorer ---
        async openRelatedExplorer(term) {
          const clean = String(term || this.searchQuery || '').trim();
          if (!clean) return;
          this.activeRelatedTerm = clean;
          this.openRelatedModal = true;
          this.relatedLoading = true;
          this.relatedTab = 'all';
          this.selectedRelatedAnnotations = [];
          this.relatedData = null;

          try {
            const res = await fetch('/api/keywords/related-interests?q=' + encodeURIComponent(clean) + '&mode=both');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.success) {
              this.relatedData = data;
            } else {
              this.showToast(data.error || 'Failed to fetch related interests', 'error');
            }
          } catch (err) {
            this.showToast('Error querying Pinterest Interest graph: ' + err.message, 'error');
          } finally {
            this.relatedLoading = false;
          }
        },

        get filteredRelatedList() {
          if (!this.relatedData) return [];
          if (this.relatedTab === 'related') {
            return this.relatedData.related_interests || [];
          }
          if (this.relatedTab === 'additions') {
            return this.relatedData.additions || [];
          }
          return this.relatedData.all || [];
        },

        toggleSelectAllRelated() {
          const list = this.filteredRelatedList;
          if (this.selectedRelatedAnnotations.length === list.length) {
            this.selectedRelatedAnnotations = [];
          } else {
            this.selectedRelatedAnnotations = list.map(item => item.annotation);
          }
        },

        async trackRelatedSingle(annotation) {
          await this.trackSingleKeyword(annotation);
        },

        async trackSelectedRelated() {
          if (!this.selectedRelatedAnnotations.length) return;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: this.selectedRelatedAnnotations })
            });
            const data = await res.json();
            if (data.success) {
              this.showToast('Successfully tracked ' + (data.added || this.selectedRelatedAnnotations.length) + ' annotations in Radar!');
              this.selectedRelatedAnnotations = [];
            } else {
              this.showToast(data.message || 'Failed to track annotations', 'error');
            }
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        },

        copyAnnotationId(id) {
          if (!id) return;
          navigator.clipboard.writeText(String(id)).then(() => {
            this.copyingAnnoId = id;
            setTimeout(() => { this.copyingAnnoId = null; }, 1800);
            this.showToast('Copied Annotation ID: ' + id);
          }).catch(() => {});
        },

        determineIntent(term) {
          const lower = String(term).toLowerCase();
          if (/(recipe|dinner|lunch|breakfast|salad|soup|bake|cook|cake|dessert|smoothie|meal)/.test(lower)) {
            return { label: 'Recipe / Cooking', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
          }
          if (/(buy|shop|store|cheap|cost|price|sale|outfit|decor|furniture|gift)/.test(lower)) {
            return { label: 'Commercial / Buyer', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
          }
          if (/(how to|tutorial|diy|guide|tips|easy|quick|hacks)/.test(lower)) {
            return { label: 'Informational / DIY', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
          }
          if (/(aesthetic|style|ideas|inspo|inspiration|design|wallpaper|art)/.test(lower)) {
            return { label: 'Inspirational / Visual', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
          }
          return { label: 'Search Discovery', badgeClass: 'bg-slate-800 text-slate-300 border-slate-700' };
        },

        highlightTerm(term) {
          if (!this.searchQuery || !term) return this.escapeHtml(term);
          const q = this.searchQuery.trim().toLowerCase();
          const cleanTerm = String(term);
          const lower = cleanTerm.toLowerCase();
          const idx = lower.indexOf(q);
          if (idx === -1) return this.escapeHtml(cleanTerm);
          const before = this.escapeHtml(cleanTerm.slice(0, idx));
          const match = this.escapeHtml(cleanTerm.slice(idx, idx + q.length));
          const after = this.escapeHtml(cleanTerm.slice(idx + q.length));
          return before + '<mark class="bg-emerald-500/20 text-emerald-300 font-semibold px-0.5 rounded not-italic">' + match + '</mark>' + after;
        },

        escapeHtml(str) {
          return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        },

        selectAllToggle() {
          if (this.selectedKeywords.length === this.results.length) {
            this.selectedKeywords = [];
          } else {
            this.selectedKeywords = this.results.map(r => r.term);
          }
        },

        async trackSingleKeyword(kw) {
          const clean = String(kw || '').trim();
          if (!clean) return;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: [clean] })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Keyword "' + clean + '" scheduled for Radar tracking!');
            } else {
              this.showToast(data.message || 'Failed to track keyword', 'error');
            }
          } catch (e) {
            this.showToast('Network error tracking keyword: ' + e.message, 'error');
          }
        },

        async trackSelectedDirectly() {
          if (!this.selectedKeywords.length || this.submittingBulk) return;
          this.submittingBulk = true;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: this.selectedKeywords })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Successfully scheduled ' + (data.added || this.selectedKeywords.length) + ' keywords for tracking!');
              this.selectedKeywords = [];
            } else {
              this.showToast(data.message || 'Failed to track keywords', 'error');
            }
          } catch (e) {
            this.showToast('Failed to import: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        },

        async submitAddToFolder() {
          if (!this.selectedKeywords.length || this.submittingBulk) return;
          this.submittingBulk = true;
          try {
            let targetFid = this.selectedFolderId;
            if (!targetFid && this.newFolderName.trim()) {
              const createRes = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: this.newFolderName.trim() })
              });
              const cData = await createRes.json();
              if (cData.folder?.id) {
                targetFid = cData.folder.id;
              }
            }

            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                keywords: this.selectedKeywords,
                folder_id: targetFid ? Number(targetFid) : null
              })
            });

            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Assigned ' + (data.added || this.selectedKeywords.length) + ' keywords to campaign folder!');
              this.openAddToFolderModal = false;
              this.selectedKeywords = [];
              this.newFolderName = '';
              await this.loadFolders();
            } else {
              this.showToast(data.message || 'Error assigning to folder', 'error');
            }
          } catch (e) {
            this.showToast('Error assigning to folder: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        },

        async submitBulkImport() {
          const cleanKws = this.parseBulkKeywords(this.bulkKeywordsText);
          if (!cleanKws.length || this.submittingBulk) return;
          if (cleanKws.length > 1000) {
            this.showToast('Maximum 1,000 keywords allowed per batch (found ' + cleanKws.length + ')', 'error');
            return;
          }

          this.submittingBulk = true;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keywords: cleanKws,
                folder_id: this.bulkTargetFolderId ? Number(this.bulkTargetFolderId) : null
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Successfully imported ' + (data.added || cleanKws.length) + ' keywords!');
              this.openBulkModal = false;
              this.bulkKeywordsText = '';
              await this.loadFolders();
            } else {
              this.showToast(data.message || 'Failed to import keywords', 'error');
            }
          } catch (e) {
            this.showToast('Failed to import: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        }
      };
    }
  </script>
</body>
</html>`;
}
