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
 * [INVARIANT: DESIGN-TOKEN-PARITY]
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
  const folderColor = folder?.color || '#E11D48';
  const folderDate = folder?.created_at ? new Date(folder.created_at).toLocaleDateString() : '';

  // Room active tab indicator classes - Unified DESIGN.md Tokens (Eliminating Rainbow Tabs)
  const tabBase = 'flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 pointer-events-auto relative z-10 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500';
  const tabInactive = `${tabBase} border-transparent text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:border-slate-300 dark:hover:border-[#27272A]`;
  const tabActive = `${tabBase} border-rose-600 text-rose-600 dark:text-rose-400 dark:border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 font-semibold`;

  const isCrossover = activeRoom === 'crossover';
  const isKeywords = activeRoom === 'keywords';
  const isCreators = activeRoom === 'creators';
  const isDomains = activeRoom === 'domains';

  const crossoverClass = isCrossover ? tabActive : tabInactive;
  const keywordsClass = isKeywords ? tabActive : tabInactive;
  const creatorsClass = isCreators ? tabActive : tabInactive;
  const domainsClass = isDomains ? tabActive : tabInactive;

  const iconActive = 'text-rose-600 dark:text-rose-400 shrink-0';
  const iconInactive = 'text-slate-400 dark:text-[#71717A] shrink-0';

  const badgeActive = 'px-1.5 py-0.5 rounded-md font-mono tabular-nums text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  const badgeInactive = 'px-1.5 py-0.5 rounded-md font-mono tabular-nums text-[10px] font-medium bg-slate-100 dark:bg-[#18181B] text-slate-500 dark:text-[#71717A] border border-slate-200/80 dark:border-[#27272A]';

  return `
  <!-- [INVARIANT: CAMPAIGN-WORKSPACE-HEADER-PARITY] Shared Workspace Header -->
  <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-xs overflow-hidden flex flex-col mb-6">
    <!-- Top Identity Bar -->
    <div class="p-5 border-b border-slate-100 dark:border-[#27272A] flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-center gap-3.5">
        <!-- Back to All Folders Link -->
        <a href="/folders" class="p-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181B] dark:hover:bg-[#27272A] text-slate-500 hover:text-slate-800 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" title="Back to All Campaign Folders">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>

        <!-- Folder Avatar & Metadata -->
        <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-inner border border-slate-200/80 dark:border-[#27272A] shrink-0 overflow-hidden"
             :style="'background-color: ' + ((typeof activeFolder !== 'undefined' && activeFolder?.color) ? activeFolder.color + '20' : '${folderColor}20')">
          <span x-show="(typeof activeFolder !== 'undefined' && activeFolder?.icon) && activeFolder.icon !== 'folder' && activeFolder.icon.length <= 4" x-text="(typeof activeFolder !== 'undefined' && activeFolder?.icon) ? activeFolder.icon : ''">${(!folderIcon || folderIcon === 'folder' || folderIcon.length > 4) ? '' : folderIcon}</span>
          <span x-show="typeof activeFolder === 'undefined' || !activeFolder?.icon || activeFolder.icon === 'folder' || activeFolder.icon.length > 4">
            <i data-lucide="folder-kanban" class="w-5 h-5 text-rose-500"></i>
          </span>
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-mono tabular-nums uppercase tracking-wider text-rose-600 dark:text-rose-400 font-bold">Campaign Workspace</span>
            <span class="text-slate-300 dark:text-[#27272A]">•</span>
            <span class="text-[10px] font-mono tabular-nums text-slate-400 dark:text-[#71717A]" x-text="'ID: #' + ((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : ((typeof scopedFolderId !== 'undefined' && scopedFolderId) ? scopedFolderId : '${cleanFolderId}'))">ID: #${cleanFolderId}</span>
            <template x-if="(typeof activeFolder !== 'undefined' && activeFolder?.created_at) || '${folderDate}'">
              <span class="text-[10px] font-mono tabular-nums text-slate-400 dark:text-[#71717A] flex items-center gap-1">
                <span>•</span>
                <span x-text="(typeof activeFolder !== 'undefined' && activeFolder?.created_at) ? new Date(activeFolder.created_at).toLocaleDateString() : '${folderDate}'">${folderDate}</span>
              </span>
            </template>
          </div>
          <h1 class="text-lg font-bold text-slate-900 dark:text-[#FAFAFA] tracking-tight truncate" x-text="(typeof activeFolder !== 'undefined' && activeFolder?.name) ? activeFolder.name : '${folderName}'">${folderName}</h1>
          <p class="text-xs text-slate-500 dark:text-[#A1A1AA] truncate max-w-xl" x-text="(typeof activeFolder !== 'undefined' && activeFolder?.description) ? activeFolder.description : '${folderDesc}'">${folderDesc}</p>
        </div>
      </div>

      <!-- Quick Action Group -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Refresh Action -->
        <button @click="typeof refreshWorkspace === 'function' ? refreshWorkspace() : (typeof loadWorkspaceData === 'function' ? loadWorkspaceData() : (typeof runCrossoverAnalysis === 'function' ? runCrossoverAnalysis(true) : window.location.reload()))"
                class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-medium text-slate-700 dark:text-[#FAFAFA] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Refresh Workspace Data">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-slate-400 dark:text-[#71717A]"></i>
          <span>Refresh</span>
        </button>

        <!-- Settings Action -->
        <button @click="typeof openFolderSettingsModal === 'function' ? openFolderSettingsModal() : (typeof openSettingsModal !== 'undefined' ? (openSettingsModal = true) : (window.location.href = '/folders/${cleanFolderId}'))"
                class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-medium text-slate-700 dark:text-[#FAFAFA] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Folder Settings & Rules">
          <i data-lucide="settings" class="w-3.5 h-3.5 text-slate-400 dark:text-[#71717A]"></i>
          <span>Settings</span>
        </button>

        <!-- Delete Action -->
        <button @click="typeof confirmDeleteFolder === 'function' ? confirmDeleteFolder((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : '${cleanFolderId}') : (confirm('Are you sure you want to delete this folder?') && (typeof executeDeleteFolder === 'function' ? executeDeleteFolder('${cleanFolderId}') : fetch('/api/folders/${cleanFolderId}', { method: 'DELETE' }).then(() => window.location.href = '/folders')))"
                class="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Delete Folder">
          <i data-lucide="trash-2" class="w-3.5 h-3.5 text-rose-500"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>

    <!-- SSR Navigation Tabs & Live Telemetry Counters -->
    <div class="flex items-center justify-between px-3 bg-slate-50/60 dark:bg-[#09090B]/60 border-t border-slate-100 dark:border-[#27272A] overflow-x-auto">
      <nav class="flex items-center space-x-1 shrink-0">
        <!-- Room 1: Crossover & Super-Pins -->
        <a :href="'/folders/' + ((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : ((typeof scopedFolderId !== 'undefined' && scopedFolderId) ? scopedFolderId : '${cleanFolderId}'))"
           href="/folders/${cleanFolderId}" class="${crossoverClass}">
          <i data-lucide="zap" class="w-4 h-4 ${isCrossover ? iconActive : iconInactive}"></i>
          <span>Crossover & Super-Pins</span>
          <span class="${isCrossover ? badgeActive : badgeInactive}"
                x-text="(typeof crossoverData !== 'undefined' && crossoverData?.summary?.total_unique_pins != null) ? crossoverData.summary.total_unique_pins : ((typeof activeFolder !== 'undefined' && (activeFolder.keyword_count ?? activeFolder.items?.length) != null) ? (activeFolder.keyword_count ?? activeFolder.items?.length) : '—')"></span>
        </a>

        <!-- Room 2: Keywords Fleet -->
        <a :href="'/folders/' + ((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : ((typeof scopedFolderId !== 'undefined' && scopedFolderId) ? scopedFolderId : '${cleanFolderId}')) + '/keywords'"
           href="/folders/${cleanFolderId}/keywords" class="${keywordsClass}">
          <i data-lucide="search" class="w-4 h-4 ${isKeywords ? iconActive : iconInactive}"></i>
          <span>Keywords Fleet</span>
          <span class="${isKeywords ? badgeActive : badgeInactive}"
                x-text="(typeof activeFolder !== 'undefined' && activeFolder?.keyword_count != null) ? activeFolder.keyword_count : '0'"></span>
        </a>

        <!-- Room 3: Creator Hub -->
        <a :href="'/folders/' + ((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : ((typeof scopedFolderId !== 'undefined' && scopedFolderId) ? scopedFolderId : '${cleanFolderId}')) + '/creators'"
           href="/folders/${cleanFolderId}/creators" class="${creatorsClass}">
          <i data-lucide="users" class="w-4 h-4 ${isCreators ? iconActive : iconInactive}"></i>
          <span>Creator Hub</span>
          <span class="${isCreators ? badgeActive : badgeInactive}"
                x-text="(typeof activeFolder !== 'undefined' && activeFolder?.creator_count != null) ? activeFolder.creator_count : '0'"></span>
        </a>

        <!-- Room 4: Domain Studio -->
        <a :href="'/folders/' + ((typeof activeFolderId !== 'undefined' && activeFolderId) ? activeFolderId : ((typeof scopedFolderId !== 'undefined' && scopedFolderId) ? scopedFolderId : '${cleanFolderId}')) + '/domains'"
           href="/folders/${cleanFolderId}/domains"
           @click="if (typeof closeDossier === 'function' && typeof isDossierOpen !== 'undefined' && isDossierOpen) { $event.preventDefault(); closeDossier(); }"
           class="${domainsClass}">
          <i data-lucide="globe" class="w-4 h-4 ${isDomains ? iconActive : iconInactive}"></i>
          <span>Domain Studio</span>
          <span class="${isDomains ? badgeActive : badgeInactive}"
                x-text="(typeof activeFolder !== 'undefined' && activeFolder?.domain_count != null) ? (activeFolder.domain_count + (activeFolder.pinned_domain_count ? ' (' + activeFolder.pinned_domain_count + ' 📌)' : '')) : (typeof totalDomains !== 'undefined' && totalDomains ? totalDomains : '0')"></span>
        </a>
      </nav>

      <!-- Scope Indicator Badge -->
      <div class="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 dark:text-[#71717A] font-mono tabular-nums pr-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500 motion-safe:animate-pulse"></span>
        <span>Scope: Folder #${cleanFolderId} Active</span>
      </div>
    </div>
  </div>
  `;
}
