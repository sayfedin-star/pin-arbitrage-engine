/**
 * Dedicated Pin Intelligence Page UI (src/ui/pin-details/index.mjs)
 */

import { getPinDetailsStyles } from './styles.mjs';
import { getPinDetailsBodyHtml } from './page-template.mjs';
import { getPinDetailsClientAppScripts } from './client-app.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';

export function getPinDetailPageHtml(pinId = '') {
  const safePinId = String(pinId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const escapedPinId = safePinId
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <!-- Universal Pin Dossier ${escapedPinId} -->
  <!-- Universal Pin Dossier ${safePinId} -->
${renderSharedDocumentHead({
  title: `Universal Pin Dossier #${escapedPinId} | Pinterest Arbitrage Intelligence`,
  referrerPolicy: 'same-origin',
  includeThemeScript: true,
  defaultTheme: 'dark',
  syncLightClass: true,
  tailwindScriptHtml: `  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          },
          colors: {
            brand: {
              50: '#fff1f2',
              100: '#ffe4e6',
              500: '#f43f5e',
              600: '#e11d48',
              700: '#be123c',
              800: '#9f1239',
              900: '#881337'
            }
          }
        }
      }
    };
  </script>`
})}
${getPinDetailsStyles()}
</head>
${getPinDetailsBodyHtml(safePinId)}
${getPinDetailsClientAppScripts()}
</body>
</html>`;
}
