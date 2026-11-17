/**
 * Shared SSR Document Head Builder (src/ui/shared-head.mjs)
 * Centralizes common HTML <head> boilerplate (meta tags, 📌 SVG favicon, Google Fonts,
 * Tailwind CDN, dark/light theme initialization script, and pinned Lucide + Alpine scripts)
 * across the SSR UI shells while preserving strict script ordering.
 */

import { getInlineFormattersScript } from './shared-formatters.mjs';

const DEFAULT_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

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

  const authInterceptorScript = `\n  <script>
(function() {
  if (typeof window === 'undefined' || window.__paeAuthInterceptorInstalled) return;
  window.__paeAuthInterceptorInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    let savedKey = '';
    try { savedKey = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pae_admin_api_key') || '') : ''; } catch (_) {}
    if (isApiCall && savedKey) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : undefined));
      if (!headers.has('x-api-key') && !headers.has('Authorization')) {
        headers.set('x-api-key', savedKey);
      }
      init.headers = headers;
    }
    let res = await origFetch(input, init);
    return res;
  };
})();
  </script>`;

  const pinImageHelpersScript = `\n  <script>
    (function() {
      if (typeof window === 'undefined') return;
      var SVG_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2371717a%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>";

      window.resolvePinImageUrl = function(url, tier) {
        tier = tier || '236x';
        if (!url || typeof url !== 'string') return SVG_PLACEHOLDER;
        if (!url.includes('pinimg.com')) return url;
        return url.replace(new RegExp('/(236x|474x|564x|736x|1200x|originals)/'), '/' + tier + '/');
      };

      window.handlePinImgError = function(img) {
        if (!img) return;
        var currentSrc = img.src || '';
        img._errStep = (img._errStep || 0) + 1;
        if (img._errStep > 4 || !currentSrc.includes('pinimg.com')) {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
          return;
        }
        if (currentSrc.includes('/236x/')) {
          img.src = currentSrc.replace('/236x/', '/474x/');
        } else if (currentSrc.includes('/474x/')) {
          img.src = currentSrc.replace('/474x/', '/736x/');
        } else if (currentSrc.includes('/736x/')) {
          img.src = currentSrc.replace('/736x/', '/originals/');
        } else {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
        }
      };
    })();
  </script>`;

  const xCloakFailsafeScript = `\n  <script>
    setTimeout(function() {
      if (typeof document !== 'undefined' && document.body && document.body.hasAttribute('x-cloak')) {
        document.body.removeAttribute('x-cloak');
      }
    }, 1200);
  </script>`;

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${referrerMeta}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fontsHref}" rel="stylesheet">${themeScript}
  <script src="https://cdn.tailwindcss.com"></script>${tailwindScriptHtml ? `\n${tailwindScriptHtml}` : ''}${includeChartJs ? '\n  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>' : ''}${sharedStyles}${authInterceptorScript}${pinImageHelpersScript}${getInlineFormattersScript().trimEnd()}${xCloakFailsafeScript}${extraHeadHtml ? `\n${extraHeadHtml}` : ''}
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>`;
}
