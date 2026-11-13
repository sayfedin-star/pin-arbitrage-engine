/**
 * Dedicated Pin Intelligence Page UI (Level 3) - V5 Cockpit Architecture
 * Pure ES Module assembling the HTML application for /pins/:pin_id and /pin/:pin_id.
 *
 * Modularized into:
 * - ./ui/pin-details/styles.mjs
 * - ./ui/pin-details/page-template.mjs
 * - ./ui/pin-details/client-app.mjs
 */

import { getEdgeShieldClientScript } from './edge-shield-client.mjs';
import { getPinDetailsStyles } from './ui/pin-details/styles.mjs';
import { getPinDetailsBodyHtml } from './ui/pin-details/page-template.mjs';
import { getPinDetailsHeadScripts, getPinDetailsClientAppScripts } from './ui/pin-details/client-app.mjs';

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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="same-origin">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">
  <title>Universal Pin Dossier #${escapedPinId} | Pinterest Arbitrage Intelligence</title>
  <!-- Universal Pin Dossier ${escapedPinId} -->
  <!-- Universal Pin Dossier ${safePinId} -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
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
  </script>
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>
  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>
${getPinDetailsStyles()}
${getPinDetailsHeadScripts()}
</head>
${getPinDetailsBodyHtml(safePinId)}
${getPinDetailsClientAppScripts()}
  ${getEdgeShieldClientScript()}
</body>
</html>`;
}
