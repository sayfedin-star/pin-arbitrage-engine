/**
 * Pin Arbitrage Engine (PAE) - Cloudflare Edge Auto-Wake Shield
 * 
 * Intercepts app.hymum.com traffic. If the InstaBox VM is asleep (Cloudflare Tunnel
 * returns 530 Error 1033 or 502/504), this worker:
 * 1. Dispatches an async resume request to InstaBox API (POST /v1/machines/:id/resume).
 * 2. Renders a high-density, dark-mode cold-start splash screen with a 3.5s countdown.
 * 3. Auto-refreshes the browser straight into the live dashboard once the tunnel wakes.
 */

const MACHINE_ID = 'm_agq2t32m5xv5joj67rqoze5h4u';

export default {
  async fetch(request, env, ctx) {
    const machineId = env.INSTABOX_MACHINE_ID || MACHINE_ID;
    const apiKey = env.INSTABOX_API_KEY;

    let response;
    let isDown = false;

    try {
      // 1. Attempt to pass through to origin tunnel
      response = await fetch(request);

      // Cloudflare Tunnel down returns HTTP 530 (Error 1033) or 502/504
      if (response.status === 530 || response.status === 502 || response.status === 504) {
        isDown = true;
      }
    } catch (err) {
      // Direct network/fetch error when tunnel is offline
      isDown = true;
    }

    // Tunnel is alive and healthy: pass through immediately with zero overhead
    if (!isDown && response) {
      return response;
    }

    // 2. Machine is asleep! Trigger wake-up via InstaBox API
    if (apiKey) {
      const wakePromise = fetch(`https://api.instabox.sh/v1/machines/${machineId}/resume`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }).catch((e) => console.error('Auto-wake dispatch error:', e.message));

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(wakePromise);
      } else {
        await wakePromise;
      }
    }

    // 3. API client requesting JSON -> Return structured retry JSON
    const acceptHeader = request.headers.get('accept') || '';
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || acceptHeader.includes('application/json')) {
      return new Response(JSON.stringify({
        status: 'resuming',
        message: 'PAE dedicated instance is waking up from idle state. Retry in 3 seconds.',
        retryAfter: 3,
        machineId
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '3',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // 4. Browser visit -> Render Swiss-grid Dark Mode Waking Splash Screen
    return new Response(renderWakingHtml(machineId), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  }
};

function renderWakingHtml(machineId) {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Waking Engine — Pin Arbitrage Engine</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #09090B;
      color: #FAFAFA;
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #121215;
      border: 1px solid #27272A;
      border-radius: 12px;
      max-width: 460px;
      width: 100%;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.7);
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, #E11D48, #FB7185, #E11D48);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(225, 29, 72, 0.1);
      border: 1px solid rgba(225, 29, 72, 0.25);
      color: #FB7185;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #E11D48;
      box-shadow: 0 0 8px #E11D48;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #FAFAFA;
      margin-bottom: 0.5rem;
    }
    p {
      font-size: 0.875rem;
      color: #A1A1AA;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .telemetry-row {
      display: flex;
      justify-content: space-between;
      background: #18181B;
      border: 1px solid #27272A;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #71717A;
    }
    .telemetry-val {
      color: #FAFAFA;
      font-weight: 500;
    }
    .progress-bar-container {
      background: #18181B;
      border: 1px solid #27272A;
      height: 6px;
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .progress-fill {
      background: #E11D48;
      height: 100%;
      width: 0%;
      border-radius: 9999px;
      transition: width 3.2s cubic-bezier(0.1, 0.7, 0.1, 1);
    }
    .status-text {
      font-size: 0.8125rem;
      font-family: 'JetBrains Mono', monospace;
      color: #A1A1AA;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .countdown {
      color: #FB7185;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="pulse-dot"></span>
      Instant Wake Protocol
    </div>
    <h1>Waking Engine Instance</h1>
    <p>The dedicated PAE database and crawler instance is resuming from idle state. Cloudflare tunnel connects automatically.</p>
    
    <div class="telemetry-row">
      <span>Target Instance</span>
      <span class="telemetry-val">${machineId.slice(0, 14)}...</span>
    </div>

    <div class="progress-bar-container">
      <div id="pfill" class="progress-fill"></div>
    </div>

    <div class="status-text">
      Connecting in <span id="sec" class="countdown">3</span>s...
    </div>
  </div>

  <script>
    // Trigger progress animation immediately
    requestAnimationFrame(() => {
      setTimeout(() => {
        const bar = document.getElementById('pfill');
        if (bar) bar.style.width = '100%';
      }, 50);
    });

    let remaining = 3;
    const secEl = document.getElementById('sec');
    const timer = setInterval(() => {
      remaining -= 1;
      if (secEl && remaining >= 0) secEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(timer);
        window.location.reload();
      }
    }, 1000);
  </script>
</body>
</html>`;
}
