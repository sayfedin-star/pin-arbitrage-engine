/**
 * Shared Creator Instant 50-Pin Visual Feed Modal (<350ms)
 * Deduplicated across Dashboard (/accounts) and Campaign Folders (/folders).
 *
 * Supports variant: 'dashboard' | 'folders' to keep Alpine expressions strictly
 * scoped to helpers available on each page's client runtime (avoiding
 * ReferenceError in /folders where resolveHdImageUrl is absent; formatUniversalAge is globally provided by pae-shell.js).
 */
export function renderCreatorVisualFeedModal({ variant = 'dashboard' } = {}) {
  const isFolders = variant === 'folders';

  const emptyStateHtml = isFolders
    ? 'No live pins discovered for @<span x-text="visualFeedUsername"></span> yet.'
    : 'No recent pins returned for this creator.';

  const pinCardHtml = isFolders
    ? `<div class="group relative rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] overflow-hidden flex flex-col justify-between hover:border-emerald-500/50 transition shadow-2xs">
              <div class="relative aspect-[2/3] bg-slate-100 dark:bg-slate-900 overflow-hidden">
                <img :src="p.images?.['1200x']?.url || p.image_url"
                     onerror="if(window.handlePinImgError){window.handlePinImgError(this)}else{this.onerror=null}"
                     class="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                     loading="lazy" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col justify-between p-2">
                  <div class="flex justify-end">
                    <a :href="safeUrl(p.link || ('https://www.pinterest.com/pin/' + encodeURIComponent(p.id || p.pin_id) + '/'))" target="_blank" rel="noopener noreferrer" class="p-1 rounded bg-black/60 text-white hover:bg-black/90 transition">
                      <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                  <div class="text-[11px] text-white line-clamp-2" x-text="p.title || p.description || 'Pinterest Pin'"></div>
                </div>
              </div>
              <div class="p-2 border-t border-slate-100 dark:border-[#27272A]/80 text-[11px] font-mono tabular-nums flex items-center justify-between text-slate-500">
                <span class="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <i data-lucide="bookmark" class="w-3 h-3"></i>
                  <span x-text="formatNumber(p.save_count ?? p.saves ?? 0)"></span>
                </span>
                <span class="text-[10px] text-slate-400" x-text="p.published_at ? new Date(p.published_at).toLocaleDateString() : 'Live'"></span>
              </div>
            </div>`
    : `<div class="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] flex flex-col justify-between shadow-xs hover:border-rose-500/50 transition">
              <div class="relative aspect-[2/3] overflow-hidden bg-slate-100 dark:bg-slate-900">
                <img :src="resolveHdImageUrl(p.image_hd_url || p.image_large_url || p.image_url)"
                     :alt="p.title || 'Pin'"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                     loading="lazy"
                     @error="if ($el.src !== (p.image_url || '')) $el.src = (p.image_url || '')">
                
                <!-- Live Saves & Repins Overlay -->
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent p-2 flex items-center justify-between text-[10px] font-mono tabular-nums text-white">
                  <span class="font-bold text-rose-400 inline-flex items-center gap-1">
                    <i data-lucide="pin" class="w-3 h-3 shrink-0"></i>
                    <span x-text="formatNumber(p.saves || p.save_count || 0)"></span>
                  </span>
                  <template x-if="p.created_at">
                    <span class="text-slate-300 text-[9px]" x-text="formatUniversalAge(p.created_at)"></span>
                  </template>
                </div>
              </div>

              <div class="p-2 space-y-1">
                <a :href="'https://www.pinterest.com/pin/' + (p.id || p.pin_id) + '/'" target="_blank" rel="noopener noreferrer"
                   class="text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:text-rose-500 line-clamp-1 block leading-snug"
                   x-text="p.title || 'Untitled Pin'"></a>
                <div class="flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-400">
                  <span x-text="'ID: ' + (p.id || p.pin_id)"></span>
                  <a :href="'/pin/' + (p.id || p.pin_id)" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline">Dossier ↗</a>
                </div>
              </div>
            </div>`;

  const footerLabel = isFolders
    ? 'Direct Pinterest Pidgets Feed'
    : 'Streamed via Pinterest Visual Pidgets + RSS Feed fusion';

  const closeBtnClass = isFolders
    ? 'px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition'
    : 'px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition';

  return `  <!-- ======================================================== -->
  <!-- CREATOR INSTANT 50-PIN VISUAL FEED MODAL (<350ms)       -->
  <!-- ======================================================== -->
  <div x-show="isVisualFeedModalOpen" x-cloak
       class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
       @keydown.escape.window="isVisualFeedModalOpen = false">
    <div class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col text-slate-900 dark:text-[#FAFAFA] overflow-hidden"
         role="dialog" aria-modal="true" aria-label="Creator Instant Visual Stream"
         @click.away="isVisualFeedModalOpen = false">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] p-4 bg-slate-50/50 dark:bg-[#18181B]/50 shrink-0">
        <div class="flex items-center space-x-3">
          <template x-if="visualFeedUser?.image_xlarge_url || visualFeedUser?.image_medium_url">
            <img :src="visualFeedUser?.image_xlarge_url || visualFeedUser?.image_medium_url" class="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-[#27272A]">
          </template>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-white" x-text="visualFeedUser?.full_name || ('@' + visualFeedUsername)"></h3>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <i data-lucide="zap" class="w-3 h-3 shrink-0"></i>
                <span>Instant Feed (&lt;350ms)</span>
              </span>
            </div>
            <div class="flex items-center space-x-3 text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              <span x-text="'@' + visualFeedUsername"></span>
              <span>•</span>
              <span x-text="visualFeedPins.length + ' Latest Pins'"></span>
              <template x-if="visualFeedUser?.follower_count">
                <span class="inline-flex items-center gap-1.5">
                  <span>•</span>
                  <span x-text="formatNumber(visualFeedUser.follower_count) + ' Followers'"></span>
                </span>
              </template>
            </div>
          </div>
        </div>
        <button @click="isVisualFeedModalOpen = false" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Modal Body / 50-Pin Gallery -->
      <div class="p-4 overflow-y-auto flex-1">
        <!-- Loading State -->
        <div x-show="isVisualFeedLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-pulse">
          <template x-for="i in 10" :key="i">
            <div class="rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-100 dark:bg-slate-900 aspect-[2/3] p-2 flex flex-col justify-between">
              <div class="h-full bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            </div>
          </template>
        </div>

        <!-- Empty State -->
        <div x-show="!isVisualFeedLoading && visualFeedPins.length === 0" class="text-center py-12 text-slate-400 text-xs font-mono">
          ${emptyStateHtml}
        </div>

        <!-- 50-Pin Grid -->
        <div x-show="!isVisualFeedLoading && visualFeedPins.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <template x-for="p in visualFeedPins" :key="p.id || p.pin_id">
            ${pinCardHtml}
          </template>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#18181B]/50 flex items-center justify-between text-xs shrink-0">
        <span class="font-mono tabular-nums text-slate-500 text-[11px]">${footerLabel}</span>
        <button @click="isVisualFeedModalOpen = false" class="${closeBtnClass}">Close</button>
      </div>

    </div>
  </div>`;
}
