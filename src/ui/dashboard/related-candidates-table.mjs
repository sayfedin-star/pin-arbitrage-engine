/**
 * Shared Related Candidates Filter Toolbar & Table Renderer
 * Deduplicates Seed Dossier (dossier mode) and Master Explorer (explorer mode)
 * candidate filter controls and table rows while preserving exact Alpine bindings.
 */
import { renderPinRowTemplate } from '../pin-row.mjs';

export function renderRelatedCandidatesToolbar({
  filterObj = 'dossierFilters',
  filteredListExpr = 'filteredDossierCandidates',
  totalListExpr = 'dossierCandidates',
  resetExpr = 'resetDossierFilters()',
  showSearchInput = true,
  searchPlaceholder = 'Search title, domain, OCR text, or pin ID...',
  leftControlsHtml = ''
} = {}) {
  const leftBlock = leftControlsHtml
    ? leftControlsHtml
    : showSearchInput
      ? `<!-- 1. Text Search -->
                <div class="relative flex-1 min-w-[200px]">
                  <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
                  <input type="text" x-model="${filterObj}.search" placeholder="${searchPlaceholder}" class="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-500">
                </div>`
      : '';

  return `<div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-[#27272A]/80 space-y-3">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                ${leftBlock}

                <!-- 4 Dropdown Filter Selectors -->
                <div class="flex items-center space-x-2 flex-wrap gap-y-2">
                  
                  <!-- Engine Provenance Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Engine:</span>
                    <select x-model="${filterObj}.engine" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Engines</option>
                      <option value="P2P_NAVBOOST">P2P_NAVBOOST (Sky)</option>
                      <option value="P2P_RANDOMWALK">P2P_RANDOMWALK (Emerald)</option>
                      <option value="P2P_TWO_TOWER">P2P_TWO_TOWER (Violet)</option>
                      <option value="P2P_RECGPT">P2P_RECGPT (Rose)</option>
                      <option value="FRESH_COLD_START">FRESH_COLD_START (Cyan)</option>
                      <option value="P2P_SHOPPING_CORPUS">P2P_SHOPPING_CORPUS (Amber)</option>
                    </select>
                  </div>

                  <!-- Velocity Tier Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Speed:</span>
                    <select x-model="${filterObj}.velocity" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Speeds</option>
                      <option value="explosive">🔥 Explosive (≥ 50/d)</option>
                      <option value="trending">⚡ Trending (10-49/d)</option>
                      <option value="stagnant">💤 Stagnant (&lt; 10/d)</option>
                    </select>
                  </div>

                  <!-- Market Arbitrage Status Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Market:</span>
                    <select x-model="${filterObj}.market" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Statuses</option>
                      <option value="vacuum">🎯 Vacuum Targets Only (Organic ≥ 5K)</option>
                      <option value="product">🛒 Competitor Products (Etsy/Shopify)</option>
                    </select>
                  </div>

                  <!-- RecGPT Meal Sequence Filter -->
                  <div class="flex items-center space-x-1 bg-white dark:bg-slate-900 rounded-xl px-2 py-1 border border-slate-200 dark:border-[#27272A] shadow-sm">
                    <span class="text-[10px] font-mono tabular-nums text-slate-400 uppercase font-semibold">Sequence:</span>
                    <select x-model="${filterObj}.sequence" class="text-xs bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none cursor-pointer">
                      <option value="all">All Sequence Roles</option>
                      <option value="DESSERT_HERO">🧁 Hero Dessert/Bake</option>
                      <option value="BEVERAGE_PAIRING">☕ Beverage/Pairing</option>
                      <option value="PASTRY_BITES">🥐 Pastry Bites</option>
                      <option value="DINNER_ANCHOR">🍽️ Dinner Anchor</option>
                      <option value="NAVBOOST_CO_VISITOR">🥖 Co-Visitor Side</option>
                      <option value="SESSION_FINISHER">🍪 Session Finisher</option>
                      <option value="PIXIE_DRIFT_OUTLIER">⚠️ Pixie Drift Outlier</option>
                    </select>
                  </div>

                </div>
              </div>

              <!-- Dynamic Result Count Badge & Reset Button -->
              <div class="flex items-center justify-between pt-1 text-xs border-t border-slate-200/60 dark:border-[#27272A]/60 font-mono tabular-nums">
                <div class="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    Showing <span class="mx-1 text-rose-600 dark:text-rose-400" x-text="${filteredListExpr}.length"></span> of <span class="mx-1" x-text="${totalListExpr}.length"></span> candidates matching filters
                  </span>
                </div>

                <button 
                  x-show="${filterObj}.search || ${filterObj}.engine !== 'all' || ${filterObj}.velocity !== 'all' || ${filterObj}.market !== 'all' || ${filterObj}.sequence !== 'all'"
                  @click="${resetExpr}"
                  class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-bold transition active:scale-95"
                >
                  <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
                  <span>Reset All Filters</span>
                </button>
              </div>
            </div>`;
}

export function renderRelatedCandidatesTable({
  mode = 'dossier',
  listExpr = mode === 'explorer' ? 'filteredExplorerCandidates' : 'filteredDossierCandidates',
  keyExpr = mode === 'explorer' ? "item.candidate_pin_id + '-' + item.seed_pin_id" : 'item.candidate_pin_id',
  showOriginSeedColumn = mode === 'explorer',
  cellPaddingClass = mode === 'explorer' ? 'py-3.5 px-4' : 'py-3 px-3',
  titleMinWidthClass = mode === 'explorer' ? 'min-w-[240px]' : 'min-w-[220px]',
  ocrTextClass = mode === 'explorer' ? 'text-[10px]' : 'text-[9px]'
} = {}) {
  const originSeedHeaderHtml = showOriginSeedColumn
    ? `\n                    <th class="${cellPaddingClass}">Origin Seed</th>`
    : '';

  const originSeedCellHtml = showOriginSeedColumn
    ? `
                  <!-- Origin Seed -->
                  <td class="${cellPaddingClass} whitespace-nowrap font-mono tabular-nums text-xs">
                    <span class="text-slate-500" x-text="'Seed: '"></span>
                    <strong class="text-slate-800 dark:text-slate-200" x-text="item.seed_pin_id"></strong>
                  </td>`
    : '';

  const savesHtml = mode === 'explorer'
    ? `
                  <!-- Metrics -->
                  <td class="${cellPaddingClass} whitespace-nowrap font-mono tabular-nums">
                    <div class="font-bold text-slate-900 dark:text-white" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                  </td>`
    : `
                  <!-- Metrics -->
                  <td class="${cellPaddingClass} whitespace-nowrap font-mono tabular-nums">
                    <div class="text-slate-900 dark:text-slate-100 font-bold" x-text="Number(item.total_saves != null ? item.total_saves : (item.saves || 0)).toLocaleString() + ' saves'"></div>
                    <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) > 0">
                      <div class="text-[10px] text-slate-500" x-text="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)).toLocaleString() + ' repins • ' + (item.avg_save_rate != null ? item.avg_save_rate : (item.save_rate != null ? item.save_rate : 0)) + '% rate'"></div>
                    </template>
                    <template x-if="Number(item.total_repins != null ? item.total_repins : (item.repins || 0)) === 0">
                      <div class="text-[10px] text-slate-500" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></div>
                    </template>
                  </td>`;

  return `<div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-[#27272A]/80 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px] uppercase tracking-wider">
                    <th class="${cellPaddingClass}">Preview & Format</th>
                    <th class="${cellPaddingClass} ${titleMinWidthClass}">Title & Vision OCR</th>${originSeedHeaderHtml}
                    <th class="${cellPaddingClass}">Pin Age & Velocity</th>
                    <th class="${cellPaddingClass}">Metrics</th>
                    <th class="${cellPaddingClass}">Dominant Color</th>
                    <th class="${cellPaddingClass}">Engine Provenance</th>
                    <th class="${cellPaddingClass}">prod:v18 Spread</th>
                    <th class="${cellPaddingClass} text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  <template x-for="item in ${listExpr}" :key="${keyExpr}">
                    ${renderPinRowTemplate({
                      pinVar: 'item',
                      pinIdExpr: 'item.candidate_pin_id',
                      showCheckbox: false,
                      showRank: false,
                      showThumb: true,
                      showTitle: true,
                      showDomain: false,
                      showVelocity: true,
                      velocityPosition: 'beforeSaves',
                      showSaves: true,
                      showRepins: false,
                      showAge: false,
                      showActions: true,
                      rowClass: 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition',
                      thumbHtml: `
                      <!-- 1. Preview & Format -->
                      <td class="${cellPaddingClass} whitespace-nowrap">
                        <div class="flex items-center space-x-2.5">
                          <template x-if="item.image_url">
                            <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="group/thumb block relative flex-shrink-0">
                              <img :src="item.image_url" alt="pin preview" loading="lazy" class="w-8 h-12 rounded-lg object-cover border shadow-sm group-hover/thumb:scale-125 transition-transform duration-200" :style="'border-color: ' + safeColor(item.winning_color, '#cbd5e1')" onerror="window.handlePinImgError(this)">
                            </a>
                          </template>
                          <template x-if="!item.image_url">
                            <div class="w-8 h-12 rounded-lg flex-shrink-0 border shadow-sm flex items-center justify-center" :style="'border-color: ' + safeColor(item.winning_color, '#cbd5e1') + '; background-color: ' + safeColor(item.winning_color, '#cbd5e1') + '15;'">
                              <i data-lucide="image" class="w-4 h-4 text-slate-400"></i>
                            </div>
                          </template>
                          <div class="space-y-1">
                            <div class="flex items-center space-x-1">
                              <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-bold tracking-wider uppercase" :class="{
                                'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.format_type === 'PRODUCT CARD',
                                'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.format_type === 'ORGANIC PIN',
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.format_type === 'VIDEO PIN',
                                'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20': item.format_type === 'IDEA PIN'
                              }" x-text="item.format_type"></span>

                              <template x-if="item.is_vacuum_target">
                                <span class="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                  VACUUM
                                </span>
                              </template>
                            </div>

                            <!-- Ingestion Method Badge -->
                            <template x-if="item.ingestion_method && item.ingestion_method !== 'uploaded'">
                              <div class="text-[8px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                                <span class="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500" x-text="item.ingestion_method === 'csv_importer' ? '⚙️ CSV Farm' : (item.ingestion_method === 'pin_scheduling' ? '⏱️ Scheduled' : item.ingestion_method)"></span>
                              </div>
                            </template>
                          </div>
                        </div>
                      </td>`,
                      titleHtml: `
                      <!-- 2. Title & Vision OCR -->
                      <td class="${cellPaddingClass}">
                        <div class="space-y-1">
                          <a :href="'https://www.pinterest.com/pin/' + item.candidate_pin_id + '/'" target="_blank" rel="noopener noreferrer" class="font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-1 hover:underline" x-text="item.title"></a>
                          <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono tabular-nums flex-wrap gap-y-1">
                            <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" x-text="item.domain"></span>
                            <span>•</span>
                            <span x-text="'ID: ' + item.candidate_pin_id"></span>
                            <template x-if="item.sequence_role && item.sequence_role !== 'DIRECT_MATCH'">
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold" :class="{
                                'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30': item.sequence_role === 'DESSERT_HERO',
                                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30': item.sequence_role === 'BEVERAGE_PAIRING',
                                'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30': item.sequence_role === 'PASTRY_BITES',
                                'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30': item.sequence_role === 'DINNER_ANCHOR',
                                'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30': item.sequence_role === 'NAVBOOST_CO_VISITOR',
                                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30': item.sequence_role === 'SESSION_FINISHER',
                                'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-extrabold': item.sequence_role === 'PIXIE_DRIFT_OUTLIER'
                              }" x-text="{
                                'DESSERT_HERO': '🧁 Hero Bake',
                                'BEVERAGE_PAIRING': '☕ Pairing',
                                'PASTRY_BITES': '🥐 Bites',
                                'DINNER_ANCHOR': '🍽️ Anchor',
                                'NAVBOOST_CO_VISITOR': '🥖 Co-Visitor',
                                'SESSION_FINISHER': '🍪 Finisher',
                                'PIXIE_DRIFT_OUTLIER': '⚠️ Pixie Drift'
                              }[item.sequence_role] || item.sequence_role"></span>
                            </template>
                          </div>
                          <template x-if="item.ocr_text">
                            <div class="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-900/90 ${ocrTextClass} text-slate-600 dark:text-slate-400 font-mono tabular-nums truncate max-w-sm" :title="item.ocr_text">
                              <span class="text-rose-500 font-bold">OCR:</span> <span x-text="item.ocr_text"></span>
                            </div>
                          </template>
                        </div>
                      </td>`,
                      extraCellsAfterTitle: originSeedCellHtml,
                      velocityHtml: `
                      <!-- Pin Age & Velocity -->
                      <td class="${cellPaddingClass} whitespace-nowrap font-mono tabular-nums">
                        <div class="text-[11px] text-slate-500 dark:text-slate-400" x-text="item.age_display || (item.age_days ? (item.age_days < 30 ? item.age_days + 'd ago' : (item.age_days < 365 ? Math.floor(item.age_days / 30) + 'mo ago' : (item.age_days / 365).toFixed(1) + 'y ago')) : '1d ago')"></div>
                        <div class="mt-0.5">
                          <template x-if="Number(item.daily_velocity || 0) >= 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40" x-text="'🔥 ' + item.daily_velocity + '/day (Explosive)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) >= 10 && Number(item.daily_velocity || 0) < 50">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" x-text="'⚡ ' + item.daily_velocity + '/day (Trending)'"></span>
                          </template>
                          <template x-if="Number(item.daily_velocity || 0) < 10">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]" x-text="item.daily_velocity + '/day (Stagnant)'"></span>
                          </template>
                        </div>
                      </td>`,
                      savesHtml,
                      extraCellsBeforeActions: `
                      <!-- Dominant Color Swatch -->
                      <td class="${cellPaddingClass} whitespace-nowrap">
                        <div class="flex items-center space-x-2">
                          <span class="w-4 h-4 rounded border flex-shrink-0 shadow-sm" :style="'background-color: ' + safeColor(item.winning_color || item.dominant_color, '#888888')"></span>
                          <div class="space-y-0.5 min-w-0">
                            <div class="font-mono tabular-nums text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide" x-text="item.winning_color || item.dominant_color || '#888888'"></div>
                            <div class="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]" x-text="item.culinary_color_name || 'Culinary Accent'" :title="item.culinary_color_name"></div>
                          </div>
                        </div>
                      </td>

                      <!-- Engine Provenance -->
                      <td class="${cellPaddingClass} whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold uppercase" :class="{
                          'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20': item.engine_source === 'P2P_NAVBOOST',
                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20': item.engine_source === 'P2P_RANDOMWALK',
                          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20': item.engine_source === 'P2P_RECGPT',
                          'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20': item.engine_source === 'P2P_TWO_TOWER',
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20': item.engine_source === 'P2P_SHOPPING_CORPUS',
                          'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20': item.engine_source === 'FRESH_COLD_START'
                        }" x-text="item.engine_source"></span>
                      </td>

                      <!-- prod:v18 Spread -->
                      <td class="${cellPaddingClass} whitespace-nowrap font-mono tabular-nums">
                        <template x-if="!item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" x-text="'+' + (item.prod_spread || 220.8) + ' Net Leverage'"></span>
                        </template>
                        <template x-if="item.is_product">
                          <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]">0.0 Net</span>
                        </template>
                      </td>`,
                      actionsHtml: `
                      <!-- Inspect Action -->
                      <td class="${cellPaddingClass} text-right whitespace-nowrap">
                        <button @click="inspectCandidate(item)" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 transition">
                          <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                      </td>`
                    })}
                  </template>
                </tbody>
              </table>
            </div>`;
}
