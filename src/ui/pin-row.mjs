/**
 * src/ui/pin-row.mjs
 * 
 * Canonical Shared PinRow UI Component
 * Single Source of Truth (SSOT) for rendering standardized Pin table rows across:
 * - Pulse Studio (/pulse)
 * - Keywords Fleet & Vault (/keywords)
 * - Campaign Folders Super-Pins & Crossover (/folders/:id)
 * - Domain Intelligence Studio (/domains)
 * - Discovery & Search (/discovery)
 * 
 * [INVARIANT: DESIGN-TOKEN-PARITY] (Geist / JetBrains Mono tabular-nums, Cockpit-Dense)
 * [INVARIANT: UNIVERSAL-STRICT-TIME-FORMATTING] (Rule 31)
 * [INVARIANT: 4-TIER-IMAGE-DEGRADATION] (window.handlePinImgError fallback)
 */

/**
 * Generates an Alpine.js-compatible <tr> template snippet for pin tables.
 * @param {object} [options]
 * @param {string} [options.pinVar='pin'] - The variable name in x-for (e.g. 'pin', 'sp', 'p')
 * @param {string} [options.indexVar='idx'] - The index variable name in x-for
 * @param {boolean} [options.showCheckbox=false] - Whether to render selection checkbox
 * @param {boolean} [options.showRank=true] - Whether to render rank/counter cell
 * @param {boolean} [options.showBoard=false] - Whether to render dedicated board column
 * @param {boolean} [options.showDomain=true] - Whether to render domain/creator column
 * @param {boolean} [options.showRepins=true] - Whether to render repins delta column
 * @param {boolean} [options.showAge=true] - Whether to render age column (Rule 31)
 * @param {boolean} [options.showActions=true] - Whether to render action buttons
 * @param {string} [options.onRowClick=''] - Alpine expression for clicking row (e.g. 'openPinInspector(pin)')
 * @param {string} [options.onBlueprintClick='openBlueprintModal(pin)'] - Blueprint action expression
 * @param {string} [options.onTagClick='setTagFilter(tag)'] - Tag pill click expression
 * @param {string} [options.dossierUrlExpr='"/pins/" + pin.pin_id'] - URL expression for pin dossier
 * @returns {string} HTML string
 */
export function renderPinRowTemplate({
  pinVar = 'pin',
  indexVar = 'idx',
  showCheckbox = false,
  showRank = true,
  showBoard = false,
  showDomain = true,
  showRepins = true,
  showAge = true,
  showActions = true,
  onRowClick = '',
  onBlueprintClick = 'openBlueprintModal(pin)',
  onTagClick = 'setTagFilter(tag)',
  dossierUrlExpr = '"/pins/" + pin.pin_id'
} = {}) {
  const p = pinVar;
  const idx = indexVar;
  const clickHandler = onRowClick ? `@click="${onRowClick}"` : '';

  return `
    <tr :data-pin-id="${p}.pin_id"
        class="hover:bg-slate-50/80 dark:hover:bg-[#18181B]/60 transition border-b border-slate-100 dark:border-[#27272A]/60 group cursor-pointer"
        ${clickHandler}>
      
      ${showCheckbox ? `
      <!-- Selection Checkbox -->
      <td class="py-2.5 px-3 text-center" @click.stop>
        <input type="checkbox" 
               :checked="isPinSelected ? isPinSelected(${p}.pin_id) : false" 
               @click="togglePinSelection ? togglePinSelection(${p}.pin_id) : null"
               class="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-[#27272A] bg-white dark:bg-[#121215]">
      </td>
      ` : ''}

      ${showRank ? `
      <!-- Rank / Index Cell -->
      <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400 text-xs tabular-nums">
        <template x-if="${p}.rank_position">
          <span class="text-rose-500" x-text="'#' + ${p}.rank_position"></span>
        </template>
        <template x-if="!${p}.rank_position">
          <span x-text="${idx} !== undefined ? (${idx} + 1) : '—'"></span>
        </template>
      </td>
      ` : ''}

      <!-- Thumbnail Preview with Fallback Waterfall -->
      <td class="py-2.5 px-3" @click.stop>
        <div class="flex items-center space-x-2">
          <a :href="${dossierUrlExpr}" 
             class="w-10 h-14 rounded-lg bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] overflow-hidden relative shrink-0 block group/img"
             title="Inspect Pin Dossier">
            <template x-if="${p}.image_url">
              <img :src="typeof window !== 'undefined' && window.resolvePinImageUrl ? window.resolvePinImageUrl(${p}.image_url, '236x') : ${p}.image_url" 
                   alt="Pin preview" 
                   loading="lazy" 
                   class="w-full h-full object-cover group-hover/img:scale-105 transition" 
                   onerror="typeof window !== 'undefined' && window.handlePinImgError ? window.handlePinImgError(this) : null" />
            </template>
            <template x-if="!${p}.image_url">
              <div class="w-full h-full flex items-center justify-center text-slate-400 text-[10px] font-mono">
                <span>PIN</span>
              </div>
            </template>
          </a>
          <div class="flex flex-col space-y-1">
            <a :href="${dossierUrlExpr}" 
               class="text-[10px] font-mono text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5" 
               title="Open PAE Internal Pin Dossier">
              <span>/pin</span>
              <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
            </a>
            <a :href="'https://www.pinterest.com/pin/' + ${p}.pin_id + '/'" 
               target="_blank" 
               rel="noopener noreferrer" 
               class="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center space-x-0.5"
               title="View on Pinterest">
              <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>
          </div>
        </div>
      </td>

      <!-- Pin Title, ID & Badges -->
      <td class="py-2.5 px-3 min-w-[200px]">
        <div class="space-y-1">
          <a :href="${dossierUrlExpr}" 
             class="font-semibold text-slate-900 dark:text-[#FAFAFA] line-clamp-1 hover:text-rose-600 dark:hover:text-rose-400 transition text-xs block" 
             :title="${p}.title || 'Untitled Pin'"
             x-text="${p}.title || 'Untitled Pin'"></a>
          
          <div class="flex items-center gap-1.5 flex-wrap text-[10px] font-mono tabular-nums text-slate-400">
            <a :href="${dossierUrlExpr}" 
               class="hover:text-rose-500 truncate" 
               x-text="'ID: ' + ${p}.pin_id"></a>

            <!-- Creation Method Badge -->
            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border shrink-0"
                  :class="typeof getPinMethodBadgeClass === 'function' ? getPinMethodBadgeClass(${p}) : 'bg-slate-100 dark:bg-[#18181B] text-slate-400 border-[#27272A]'"
                  x-text="typeof formatPinMethod === 'function' ? formatPinMethod(${p}) : (${p}.creation_method || 'Standard')"></span>

            <!-- Rule 31 Age Badge -->
            <template x-if="${p}.pin_age_days !== null && ${p}.pin_age_days !== undefined && ${p}.pin_age_days !== ''">
              <span class="text-slate-400 text-[9.5px] shrink-0" 
                    :title="'Age: ' + ${p}.pin_age_days + ' days'" 
                    x-text="'📅 ' + (typeof formatUniversalAge === 'function' ? formatUniversalAge(${p}.pin_age_days) : (${p}.pin_age_days + 'd'))"></span>
            </template>

            <!-- SEO Alt-Text Badge -->
            <template x-if="${p}.alt_text">
              <span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono border border-emerald-500/20 font-bold" 
                    title="SEO Alt-Text Verified">✓ Alt</span>
            </template>
          </div>

          <!-- Clickable Visual Annotation Pills -->
          <template x-if="(${p}.visual_annotations && ${p}.visual_annotations.length > 0) || (${p}.annotations && ${p}.annotations.length > 0)">
            <div class="flex items-center gap-1 mt-1 flex-wrap" @click.stop>
              <template x-for="(tag, tidx) in (${p}.visual_annotations || ${p}.annotations || []).slice(0, 3)" :key="tidx">
                <button type="button" 
                        @click.stop="${onTagClick.replace(/tag\b/g, '(tag.display || tag.norm || tag)')}"
                        class="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-rose-50 dark:bg-[#18181B] dark:hover:bg-rose-950/30 text-[9px] font-mono text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-[#27272A] hover:border-rose-500/30 transition cursor-pointer"
                        :title="'Filter by #' + (tag.display || tag.norm || tag)">
                  <span x-text="'#' + (tag.display || tag.norm || tag)"></span>
                </button>
              </template>
            </div>
          </template>
        </div>
      </td>

      ${showDomain ? `
      <!-- Domain / Creator Column -->
      <td class="py-2.5 px-3">
        <div class="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[130px] text-xs" 
             x-text="${p}.domain || 'Uploaded by user'"></div>
        <div class="text-[10px] text-slate-400 truncate max-w-[130px] font-mono tabular-nums" 
             x-text="${p}.creator_username ? '@' + ${p}.creator_username : (${p}.metadata?.pinner?.username ? '@' + ${p}.metadata.pinner.username : 'unknown')"></div>
      </td>
      ` : ''}

      ${showBoard ? `
      <!-- Board Column -->
      <td class="py-2.5 px-3">
        <div class="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[130px] text-xs" 
             x-text="${p}.board_name || ${p}.metadata?.board_name || '—'"></div>
      </td>
      ` : ''}

      <!-- Velocity / Window Saves Gain -->
      <td class="py-2.5 px-3 text-right">
        <div class="font-mono tabular-nums font-bold text-xs text-rose-600 dark:text-rose-400"
             x-text="'+' + (typeof formatNumber === 'function' ? formatNumber(${p}.window_saves_gain ?? ${p}.effective_velocity ?? ${p}.daily_save_velocity ?? ${p}.delta_saves_24h ?? 0) : (${p}.daily_save_velocity || 0)) + '/d'">
        </div>
        <div class="text-[9px] font-mono text-slate-400 uppercase">Velocity</div>
      </td>

      <!-- Total Saves -->
      <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200 text-xs" 
          x-text="typeof formatNumber === 'function' ? formatNumber(${p}.save_count || 0) : (${p}.save_count || 0)"></td>

      ${showRepins ? `
      <!-- Repins Delta -->
      <td class="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400 text-xs" 
          x-text="'+' + (typeof formatNumber === 'function' ? formatNumber(${p}.delta_repins_24h || 0) : (${p}.delta_repins_24h || 0))"></td>
      ` : ''}

      ${showAge ? `
      <!-- Age (Strict Rule 31) -->
      <td class="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 text-xs" 
          x-text="typeof formatUniversalAge === 'function' ? formatUniversalAge(${p}.pin_age_days) : (${p}.pin_age_days ? ${p}.pin_age_days + 'd' : '—')"></td>
      ` : ''}

      ${showActions ? `
      <!-- Actions -->
      <td class="py-2.5 px-3 text-right" @click.stop>
        <div class="flex items-center justify-end gap-1.5">
          <button type="button" 
                  @click="${onBlueprintClick}" 
                  class="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-bold transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  title="Inspect pin dossier and generate production blueprint">
            <span>⚡ Blueprint</span>
          </button>
          <a :href="${dossierUrlExpr}" 
             class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#18181B] hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-[#27272A] transition cursor-pointer" 
             title="Open Full Pin Dossier">
            <span>↗</span>
          </a>
        </div>
      </td>
      ` : ''}
    </tr>
  `;
}
