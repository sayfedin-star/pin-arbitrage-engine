/**
 * Shared SSR Document Head Builder (src/ui/shared-head.mjs)
 * Centralizes common HTML <head> boilerplate (meta tags, 📌 SVG favicon, Google Fonts,
 * Tailwind CDN, dark/light theme initialization script, and pinned Lucide + Alpine scripts)
 * across the SSR UI shells while preserving strict script ordering.
 */

const DEFAULT_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

export function renderSharedDocumentHead({
  title = 'Pinterest Arbitrage Engine',
  referrerPolicy = '',
  fontsHref = DEFAULT_FONTS_HREF,
  tailwindScriptHtml = '',
  includeThemeScript = true,
  defaultTheme = 'light',
  includeChartJs = false,
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
        if (saved === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
      } catch (_) {}
    })();
  </script>`
      : `\n  <script>
    (function() {
      try {
        const saved = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) : null;
        if (saved === 'dark') {
          if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.classList.add('dark');
          }
        } else {
          if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.classList.remove('dark');
          }
        }
      } catch (_) {}
    })();
  </script>`
    : '';

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${referrerMeta}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fontsHref}" rel="stylesheet">${themeScript}
  <script src="https://cdn.tailwindcss.com"></script>${tailwindScriptHtml ? `\n${tailwindScriptHtml}` : ''}${includeChartJs ? '\n  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>' : ''}${extraHeadHtml ? `\n${extraHeadHtml}` : ''}
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>`;
}
