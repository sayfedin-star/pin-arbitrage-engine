/**
 * Shared SSR Document Head Builder (src/ui/shared-head.mjs)
 * Centralizes common HTML <head> boilerplate (meta tags, 📌 SVG favicon, Google Fonts,
 * FOUC-free theme initialization script, Tailwind CDN, cached `/pae-shell.js` shared runtime,
 * and pinned Lucide + Alpine scripts) across all 7 SSR UI studios.
 */

import { PAE_SHELL_VERSION } from '../routes/pages.mjs';

const DEFAULT_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

export function compactHtmlFragment(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, (comment) => (/(?:INVARIANT-LOCK|Lock \d+)/.test(comment) ? comment : ''))
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function renderSharedDocumentHead({
  title = 'Pinterest Arbitrage Engine',
  referrerPolicy = '',
  fontsHref = DEFAULT_FONTS_HREF,
  tailwindScriptHtml = '',
  includeThemeScript = true,
  defaultTheme = 'light',
  syncLightClass = false,
  includeChartJs = false,
  extraStyleCss = '',
  extraHeadHtml = ''
} = {}) {
  const referrerMeta = referrerPolicy
    ? `\n  <meta name="referrer" content="${referrerPolicy}">`
    : '';

  const themeScript = includeThemeScript
    ? defaultTheme === 'dark'
      ? `\n  <script>
    (function() {
      try {
        const saved = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) : null;
        if (typeof document !== 'undefined' && document.documentElement) {
          if (saved === 'light') {
            document.documentElement.classList.remove('dark');${syncLightClass ? "\n            document.documentElement.classList.add('light');" : ''}
          } else {
            document.documentElement.classList.add('dark');${syncLightClass ? "\n            document.documentElement.classList.remove('light');" : ''}
          }
        }
      } catch (_) {}
    })();
  </script>`
      : `\n  <script>
    (function() {
      try {
        const saved = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) : null;
        if (typeof document !== 'undefined' && document.documentElement) {
          if (saved === 'dark') {
            document.documentElement.classList.add('dark');${syncLightClass ? "\n            document.documentElement.classList.remove('light');" : ''}
          } else {
            document.documentElement.classList.remove('dark');${syncLightClass ? "\n            document.documentElement.classList.add('light');" : ''}
          }
        }
      } catch (_) {}
    })();
  </script>`
    : '';

  const sharedStyles = `\n  <style>
    [x-cloak] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.28); border-radius: 9999px; }
    .dark ::-webkit-scrollbar-thumb { background: #27272A; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.45); }
    .dark ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }${extraStyleCss ? `\n    ${extraStyleCss.trim()}` : ''}
  </style>`;

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${referrerMeta}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link href="${fontsHref}" rel="stylesheet">${themeScript}
  <script src="https://cdn.tailwindcss.com"></script>${tailwindScriptHtml ? `\n${tailwindScriptHtml}` : ''}${includeChartJs ? '\n  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>' : ''}${sharedStyles}
  <script src="/pae-shell.js?v=${PAE_SHELL_VERSION}"></script>${extraHeadHtml ? `\n${extraHeadHtml}` : ''}
  <script defer src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>`;
}
