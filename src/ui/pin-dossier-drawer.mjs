/**
 * src/ui/pin-dossier-drawer.mjs
 *
 * Shared Slide-Over Pin Dossier Drawer Component (SSOT)
 * Serves both Dashboard (Candidate Pin Deep-Inspection & Pixie Centroid Dossiers)
 * and Keywords Studio (Pin Deep Dossier Inspector).
 */

/**
 * Renders a standardized sticky drawer header bar with optional icon, title/subtitle,
 * badges, toolbar actions, and an accessible close button.
 *
 * @param {object} opts
 * @returns {string}
 */
export function renderPinDossierHeader(opts = {}) {
  const {
    iconHtml = '',
    titleHtml = '',
    subtitleHtml = '',
    badgesHtml = '',
    actionsHtml = '',
    closeExpr = '',
    closeLabel = 'Close drawer',
    wrapperClass = 'p-4 sm:p-5 border-b border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-[#18181B]/50 shrink-0'
  } = opts;

  const hasSubtitle = Boolean(subtitleHtml);
  const titleBlock = hasSubtitle
    ? `<div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              ${titleHtml}
              ${badgesHtml}
            </div>
            ${subtitleHtml}
          </div>`
    : `<div class="flex flex-wrap items-center gap-2 min-w-0">
            ${titleHtml}
            ${badgesHtml}
          </div>`;

  const closeButtonHtml = closeExpr
    ? `<button type="button" @click="${closeExpr}" aria-label="${closeLabel}" title="${closeLabel}"
                    class="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer shrink-0">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>`
    : '';

  return `<div class="${wrapperClass}">
          <div class="flex items-center gap-3 min-w-0">
            ${iconHtml}
            ${titleBlock}
          </div>
          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
            ${actionsHtml}
            ${closeButtonHtml}
          </div>
        </div>`;
}

/**
 * Renders a copyable intelligence text block (e.g. SEO Alt Text, Close-up Description,
 * OCR Extraction, Midjourney Prompt, Dual JSON-LD Schema).
 *
 * @param {object} opts
 * @returns {string}
 */
export function renderPinDossierTextBlock(opts = {}) {
  const {
    title = '',
    badgeText = '',
    badgeClass = 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    iconName = 'file-text',
    iconClass = 'w-4 h-4 text-slate-500',
    copyExpr = '',
    copyButtonLabel = 'Copy',
    copyButtonLabelExpr = '',
    copyButtonClass = 'px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer',
    bodyTextExpr = '',
    bodyClass = 'text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]/80',
    bodyHtml = '',
    containerClass = 'p-4 rounded-2xl bg-slate-100/90 dark:bg-[#070d18] border border-slate-200 dark:border-[#27272A] space-y-2'
  } = opts;

  const badgeHtml = badgeText
    ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${badgeClass}">${badgeText}</span>`
    : '';

  const copyHtml = copyExpr
    ? `<button type="button" @click="${copyExpr}" class="${copyButtonClass}">
              <i data-lucide="copy" class="w-3 h-3"></i>
              ${copyButtonLabelExpr ? `<span x-text="${copyButtonLabelExpr}"></span>` : `<span>${copyButtonLabel}</span>`}
            </button>`
    : '';

  const resolvedBodyHtml = bodyHtml || `<p class="${bodyClass}" x-text="${bodyTextExpr}"></p>`;

  return `<div class="${containerClass}">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center space-x-1.5 min-w-0">
                <i data-lucide="${iconName}" class="${iconClass} shrink-0"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono truncate">${title}</h4>
                ${badgeHtml}
              </div>
              ${copyHtml}
            </div>
            ${resolvedBodyHtml}
          </div>`;
}

/**
 * Renders a responsive KPI metric grid for slide-over dossiers with tabular numerals.
 *
 * @param {object} opts
 * @returns {string}
 */
export function renderPinDossierKpiGrid(opts = {}) {
  const {
    title = '',
    items = [],
    gridClass = 'grid grid-cols-3 sm:grid-cols-6 gap-2',
    cardClass = 'p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#27272A] text-center space-y-0.5'
  } = opts;

  const cardsHtml = items.map((item) => {
    const valueClass = item.valueClass || 'text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono tabular-nums block';
    return `<div class="${cardClass}">
                <span class="text-[10px] font-bold text-slate-400 block">${item.label}</span>
                <span class="${valueClass}" x-text="${item.valueExpr}"></span>
                ${item.extraHtml || ''}
              </div>`;
  }).join('\n');

  if (!title) {
    return `<div class="${gridClass}">
            ${cardsHtml}
          </div>`;
  }

  return `<div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">${title}</h4>
            <div class="${gridClass}">
              ${cardsHtml}
            </div>
          </div>`;
}

/**
 * Renders the unified slide-over Pin Dossier Drawer shell (backdrop, ESC binding,
 * slide-in panel transitions, sticky header slot, and scrollable body slot).
 *
 * @param {object} opts
 * @returns {string}
 */
export function renderPinDossierDrawer(opts = {}) {
  const {
    showExpr = 'isPinDrawerOpen',
    closeExpr = 'closePinInspector()',
    ariaLabel = 'Pin Deep Dossier',
    overlayClass = 'relative z-50',
    backdropClass = 'fixed inset-0 bg-slate-950/70 backdrop-blur-xs',
    panelClass = 'w-screen max-w-xl md:max-w-2xl bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] shadow-2xl flex flex-col h-full overflow-hidden',
    bodyClass = 'flex-1 overflow-y-auto p-5 sm:p-6 space-y-6',
    useTransitions = true,
    headerHtml = '',
    bodyHtml = ''
  } = opts;

  const backdropTransitionAttrs = useTransitions
    ? `x-transition:enter="transition-opacity ease-linear duration-300"
         x-transition:enter-start="opacity-0"
         x-transition:enter-end="opacity-100"
         x-transition:leave="transition-opacity ease-linear duration-300"
         x-transition:leave-start="opacity-100"
         x-transition:leave-end="opacity-0"`
    : '';

  const panelTransitionAttrs = useTransitions
    ? `x-transition:enter="transform transition ease-in-out duration-300"
           x-transition:enter-start="translate-x-full"
           x-transition:enter-end="translate-x-0"
           x-transition:leave="transform transition ease-in-out duration-300"
           x-transition:leave-start="translate-x-0"
           x-transition:leave-end="translate-x-full"`
    : '';

  return `<div x-show="${showExpr}" x-cloak class="${overlayClass}" @keydown.escape.window="${closeExpr}">
    <div x-show="${showExpr}"
         ${backdropTransitionAttrs}
         @click="${closeExpr}"
         class="${backdropClass}"></div>

    <div class="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-16 pointer-events-none">
      <div x-show="${showExpr}"
           ${panelTransitionAttrs}
           class="${panelClass} pointer-events-auto" role="dialog" aria-modal="true" aria-label="${ariaLabel}">
        ${headerHtml}
        <div class="${bodyClass}">
          ${bodyHtml}
        </div>
      </div>
    </div>
  </div>`;
}
