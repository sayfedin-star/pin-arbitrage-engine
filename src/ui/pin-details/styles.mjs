/**
 * Pin Details UI Stylesheet
 * Extracted from src/pin-details-ui.mjs
 */

export function getPinDetailsStyles() {
  return `
  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }

    /* ======================================================== */
    /* UNIFIED LIGHT THEME OVERRIDES (100% PURE WHITE SAAS)    */
    /* ======================================================== */
    html:not(.dark),
    html.light {
      color-scheme: light;
    }
    html:not(.dark) body,
    html.light body {
      background-color: #f8fafc !important;
      color: #0f172a !important;
    }

    /* Primary Backgrounds & Canvas */
    html:not(.dark) [class*="bg-[#09090B]"],
    html.light [class*="bg-[#09090B]"],
    html:not(.dark) header,
    html.light header {
      background-color: rgba(255, 255, 255, 0.95) !important;
      border-color: #e2e8f0 !important;
    }

    /* Card Elevation 1 (Containers, Panels, Cards) -> Pure Crisp White */
    html:not(.dark) [class*="bg-[#121215]"],
    html.light [class*="bg-[#121215]"] {
      background-color: #ffffff !important;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04) !important;
    }

    /* Card Elevation 2 & Sub-surfaces (Buttons, Pills, Inputs, Sub-cards) */
    html:not(.dark) [class*="bg-[#18181B]"],
    html.light [class*="bg-[#18181B]"] {
      background-color: #f8fafc !important;
    }

    /* Interactive Highlight & Hover States */
    html:not(.dark) [class*="bg-[#27272A]"],
    html.light [class*="bg-[#27272A]"] {
      background-color: #e2e8f0 !important;
    }
    html:not(.dark) [class*="hover:bg-[#18181B]"]:hover,
    html:not(.dark) [class*="hover:bg-[#27272A]"]:hover {
      background-color: #f1f5f9 !important;
    }

    /* Structural Borders & Dividers */
    html:not(.dark) [class*="border-[#27272A]"],
    html.light [class*="border-[#27272A]"],
    html:not(.dark) [class*="divide-[#27272A]"] > :not([hidden]) ~ :not([hidden]) {
      border-color: #e2e8f0 !important;
    }
    html:not(.dark) [class*="border-[#1E1E22]"],
    html.light [class*="border-[#1E1E22]"],
    html:not(.dark) [class*="divide-[#1E1E22]"] > :not([hidden]) ~ :not([hidden]) {
      border-color: #f1f5f9 !important;
    }

    /* High-Contrast Crisp Typography for Light Mode */
    html:not(.dark) [class*="text-[#FAFAFA]"],
    html.light [class*="text-[#FAFAFA]"] {
      color: #0f172a !important;
    }
    html:not(.dark) .text-white:not(.text-white-keep) {
      color: #0f172a !important;
    }
    html:not(.dark) .text-slate-100,
    html:not(.dark) .text-slate-200,
    html:not(.dark) .text-zinc-200 {
      color: #334155 !important;
    }
    html:not(.dark) .text-zinc-300 {
      color: #475569 !important;
    }
    html:not(.dark) .text-slate-300 {
      color: #334155 !important;
    }
    html:not(.dark) .text-slate-400 {
      color: #64748b !important;
    }
    html:not(.dark) .text-slate-500 {
      color: #94a3b8 !important;
    }

    /* Preserve Crisp White Text on Primary & Accent Buttons */
    html:not(.dark) .bg-rose-600,
    html:not(.dark) .bg-rose-600 *,
    html:not(.dark) .bg-red-600,
    html:not(.dark) .bg-red-600 *,
    html:not(.dark) .bg-emerald-600,
    html:not(.dark) .bg-emerald-600 *,
    html:not(.dark) .bg-indigo-600,
    html:not(.dark) .bg-indigo-600 * {
      color: #ffffff !important;
    }

    /* Light Theme Tab Navigation & Badges */
    html:not(.dark) button.border-rose-500 {
      color: #0f172a !important;
      border-color: #e11d48 !important;
    }
    html:not(.dark) [class*="bg-rose-500/20"] {
      background-color: #ffe4e6 !important;
      color: #be123c !important;
    }

    /* SVG Trajectory Chart Grid in Light Mode */
    html:not(.dark) svg line[stroke="#27272A"] {
      stroke: #e2e8f0 !important;
    }

    /* Light Theme Badges & Semantics (No Muddy Dark Rectangles) */
    html:not(.dark) [class*="bg-emerald-950"] {
      background-color: #ecfdf5 !important;
      color: #065f46 !important;
      border-color: #a7f3d0 !important;
    }
    html:not(.dark) [class*="text-emerald-300"] {
      color: #047857 !important;
    }
    html:not(.dark) [class*="bg-amber-950"] {
      background-color: #fffbeb !important;
      color: #92400e !important;
      border-color: #fde68a !important;
    }
    html:not(.dark) [class*="text-amber-300"] {
      color: #b45309 !important;
    }
    html:not(.dark) [class*="bg-red-950"],
    html:not(.dark) [class*="bg-rose-950"] {
      background-color: #fff1f2 !important;
      color: #9f1239 !important;
      border-color: #fecdd3 !important;
    }
    html:not(.dark) [class*="text-red-300"],
    html:not(.dark) [class*="text-rose-300"] {
      color: #be123c !important;
    }
    html:not(.dark) [class*="bg-sky-950"] {
      background-color: #f0f9ff !important;
      color: #075985 !important;
      border-color: #bae6fd !important;
    }
    html:not(.dark) [class*="bg-indigo-950"] {
      background-color: #eef2ff !important;
      color: #3730a3 !important;
      border-color: #c7d2fe !important;
    }
    html:not(.dark) [class*="bg-slate-800"] {
      background-color: #f1f5f9 !important;
      border-color: #cbd5e1 !important;
      color: #334155 !important;
    }

    /* Inputs, Selects & Tables in Light Mode */
    html:not(.dark) select,
    html:not(.dark) input {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    html:not(.dark) tr:hover {
      background-color: #f8fafc !important;
    }
  </style>
  `;
}
