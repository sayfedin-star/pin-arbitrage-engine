/**
 * src/ui/campaign-workspace-header.mjs
 * 
 * Canonical Shared Campaign Workspace Header Component
 * Single Source of Truth (SSOT) for Campaign Workspace header navigation across:
 * - Room 1: /folders/:id (Crossover & Super-Pins)
 * - Room 2: /folders/:id/keywords (Scoped Keywords Fleet)
 * - Room 3: /folders/:id/creators (Scoped Creator Hub)
 * - Room 4: /folders/:id/domains (Scoped Domain Studio)
 * 
 * [INVARIANT: CAMPAIGN-WORKSPACE-HEADER-PARITY]
 */

export function renderCampaignWorkspaceHeader({
  activeRoom = 'crossover', // 'crossover' | 'keywords' | 'creators' | 'domains'
  folderId = '',
  folder = null
} = {}) {
  const cleanFolderId = String(folderId || '').trim();
  const folderName = folder?.name || 'Campaign Workspace';
  const folderDesc = folder?.description || 'Campaign cluster for Pinterest arbitrage';
  const folderIcon = folder?.icon || '📁';
  const folderColor = folder?.color || '#6366f1';
  const folderDate = folder?.created_at ? new Date(folder.created_at).toLocaleDateString() : '';

  // Room active tab indicator classes
  const tabBase = 'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 cursor-pointer select-none';
  const tabInactive = `${tabBase} border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700`;

  const isCrossover = activeRoom === 'crossover';
  const isKeywords = activeRoom === 'keywords';
  const isCreators = activeRoom === 'creators';
  const isDomains = activeRoom === 'domains';

  const crossoverClass = isCrossover 
    ? `${tabBase} border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20` 
    : tabInactive;

  const keywordsClass = isKeywords 
    ? `${tabBase} border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20` 
    : tabInactive;

  const creatorsClass = isCreators 
    ? `${tabBase} border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400 bg-purple-50/50 dark:bg-purple-950/20` 
    : tabInactive;

  const domainsClass = isDomains 
    ? `${tabBase} border-sky-600 text-sky-600 dark:text-sky-400 dark:border-sky-400 bg-sky-50/50 dark:bg-sky-950/20` 
    : tabInactive;

  return `
  <!-- [INVARIANT: CAMPAIGN-WORKSPACE-HEADER-PARITY] Shared Workspace Header -->
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col mb-6">
    <!-- Top Identity Bar -->
    <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-center gap-3.5">
        <!-- Back to All Folders Link -->
        <a href="/folders" class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors" title="Back to All Campaign Folders">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>

        <!-- Folder Avatar & Metadata -->
        <div class="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shadow-inner border border-slate-200/80 dark:border-white/10 shrink-0"
             :style="'background-color: ' + (activeFolder?.color ? activeFolder.color + '20' : '${folderColor}20')">
          <span x-text="activeFolder?.icon || '${folderIcon}'">${folderIcon}</span>
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">Campaign Workspace</span>
            <span class="text-slate-300 dark:text-slate-700">•</span>
            <span class="text-[10px] font-mono text-slate-400" x-text="'ID: #' + (activeFolderId || '${cleanFolderId}')">ID: #${cleanFolderId}</span>
            <template x-if="activeFolder?.created_at || '${folderDate}'">
              <span class="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                <span>•</span>
                <span x-text="activeFolder?.created_at ? new Date(activeFolder.created_at).toLocaleDateString() : '${folderDate}'">${folderDate}</span>
              </span>
            </template>
          </div>
          <h1 class="text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate" x-text="activeFolder?.name || '${folderName}'">${folderName}</h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xl" x-text="activeFolder?.description || '${folderDesc}'">${folderDesc}</p>
        </div>
      </div>

      <!-- Quick Action Group -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Refresh Action -->
        <button @click="typeof refreshWorkspace === 'function' ? refreshWorkspace() : (typeof loadWorkspaceData === 'function' ? loadWorkspaceData() : (typeof runCrossoverAnalysis === 'function' ? runCrossoverAnalysis(true) : window.location.reload()))"
                class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Refresh Workspace Data">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Refresh</span>
        </button>

        <!-- Settings Action -->
        <button @click="typeof openFolderSettingsModal === 'function' ? openFolderSettingsModal() : (typeof openSettingsModal !== 'undefined' ? (openSettingsModal = true) : (window.location.href = '/folders/${cleanFolderId}'))"
                class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Folder Settings & Rules">
          <i data-lucide="settings" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Settings</span>
        </button>

        <!-- Delete Action -->
        <button @click="typeof confirmDeleteFolder === 'function' ? confirmDeleteFolder(activeFolderId || '${cleanFolderId}') : (confirm('Are you sure you want to delete this folder?') && (typeof executeDeleteFolder === 'function' ? executeDeleteFolder('${cleanFolderId}') : fetch('/api/folders/${cleanFolderId}', { method: 'DELETE' }).then(() => window.location.href = '/folders')))"
                class="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Delete Folder">
          <i data-lucide="trash-2" class="w-3.5 h-3.5 text-rose-500"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>

    <!-- SSR Navigation Tabs & Live Telemetry Counters -->
    <div class="flex items-center justify-between px-3 bg-slate-50/60 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto">
      <nav class="flex items-center space-x-1 shrink-0">
        <!-- Room 1: Crossover & Super-Pins -->
        <a href="/folders/${cleanFolderId}" class="${crossoverClass}">
          <i data-lucide="zap" class="w-4 h-4 text-indigo-500"></i>
          <span>⚡ Crossover & Super-Pins</span>
          <span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                x-text="activeFolder?.items?.length || crossoverData?.summary?.total_unique_pins || '—'"></span>
        </a>

        <!-- Room 2: Keywords Fleet -->
        <a href="/folders/${cleanFolderId}/keywords" class="${keywordsClass}">
          <i data-lucide="search" class="w-4 h-4 text-emerald-500"></i>
          <span>🎯 Keywords Fleet</span>
          <span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                x-text="activeFolder?.keyword_count || '0'"></span>
        </a>

        <!-- Room 3: Creator Hub -->
        <a href="/folders/${cleanFolderId}/creators" class="${creatorsClass}">
          <i data-lucide="users" class="w-4 h-4 text-purple-500"></i>
          <span>👥 Creator Hub</span>
          <span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400"
                x-text="activeFolder?.creator_count || '0'"></span>
        </a>

        <!-- Room 4: Domain Studio -->
        <a href="/folders/${cleanFolderId}/domains" class="${domainsClass}">
          <i data-lucide="globe" class="w-4 h-4 text-sky-500"></i>
          <span>🌐 Domain Studio</span>
          <span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-400"
                x-text="activeFolder?.domain_count ? (activeFolder.domain_count + ' (' + (activeFolder.pinned_domain_count || 0) + ' 📌)') : '0'"></span>
        </a>
      </nav>

      <!-- Scope Indicator Badge -->
      <div class="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 font-mono pr-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Scope: Folder #${cleanFolderId} Active</span>
      </div>
    </div>
  </div>
  `;
}
