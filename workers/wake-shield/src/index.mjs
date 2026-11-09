/**
 * Pin Arbitrage Engine (PAE) - Cloudflare Edge Auto-Wake Shield & Access Gate
 * 
 * 1. ZERO-TRUST ACCESS GATE: Validates operator credentials at Cloudflare Edge in 0ms.
 *    Unauthorized requests are blocked BEFORE touching or waking the InstaBox VM!
 * 2. AUTO-WAKE SHIELD: If authorized and the InstaBox VM is asleep (Cloudflare Tunnel
 *    returns 530 Error 1033 or 502/504), this worker:
 *    - Dispatches an async resume request to InstaBox API (POST /v1/machines/:id/resume).
 *    - Renders a high-density, dark-mode cold-start splash screen with a 3.5s countdown.
 *    - Auto-refreshes the browser straight into the live dashboard once the tunnel wakes.
 */

const MACHINE_ID = 'm_agq2t32m5xv5joj67rqoze5h4u';
const DEFAULT_PIN = 'pae2026';
const AUTH_COOKIE_NAME = 'pae_shield_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function computeExpectedToken(secret) {
  const enc = new TextEncoder();
  const data = enc.encode(`${secret}:pae_access_salt_2026`);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default {
  async fetch(request, env, ctx) {
    const machineId = env.INSTABOX_MACHINE_ID || MACHINE_ID;
    const apiKey = env.INSTABOX_API_KEY;
    const configuredPin = env.SHIELD_PIN || env.API_SECRET_KEY || DEFAULT_PIN;
    const fallbackPin = env.API_SECRET_KEY || DEFAULT_PIN;

    const expectedTokens = await Promise.all([
      computeExpectedToken(configuredPin),
      computeExpectedToken(fallbackPin),
      computeExpectedToken(DEFAULT_PIN)
    ]);

    const url = new URL(request.url);

    // -------------------------------------------------------------
    // A. LOGOUT HANDLER (?logout=true or /logout)
    // -------------------------------------------------------------
    if (url.searchParams.get('logout') === 'true' || url.pathname === '/logout') {
      url.searchParams.delete('logout');
      const cleanUrl = url.pathname === '/logout' ? '/' : (url.pathname + (url.search ? url.search : ''));
      return new Response(null, {
        status: 302,
        headers: {
          'Location': cleanUrl,
          'Set-Cookie': `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
        }
      });
    }

    // -------------------------------------------------------------
    // B. AUTHENTICATION VERIFICATION (Cookie, Header, or URL Param)
    // -------------------------------------------------------------
    let isAuthorized = false;

    // 1. Check Cookie
    const clientToken = parseCookie(request, AUTH_COOKIE_NAME);
    if (clientToken && expectedTokens.includes(clientToken)) {
      isAuthorized = true;
    }

    // 2. Check HTTP Headers (x-api-key or Authorization Bearer)
    const headerApiKey = request.headers.get('x-api-key') || '';
    const authHeader = request.headers.get('Authorization') || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    if (
      (headerApiKey && (headerApiKey === configuredPin || headerApiKey === fallbackPin)) ||
      (bearerToken && (bearerToken === configuredPin || bearerToken === fallbackPin))
    ) {
      isAuthorized = true;
    }

    // 3. Check URL Query Parameter (?pin=... or ?key=...)
    const queryPin = url.searchParams.get('pin') || url.searchParams.get('key');
    if (queryPin && (queryPin === configuredPin || queryPin === fallbackPin || queryPin === DEFAULT_PIN)) {
      const token = await computeExpectedToken(queryPin);
      url.searchParams.delete('pin');
      url.searchParams.delete('key');
      const cleanUrl = url.pathname + (url.search ? url.search : '');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': cleanUrl,
          'Set-Cookie': `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`
        }
      });
    }

    // 4. Handle AJAX PIN submission from the Login Gate (POST /api/shield-auth)
    if (request.method === 'POST' && url.pathname === '/api/shield-auth') {
      try {
        const body = await request.json();
        const pinAttempt = (body?.pin || '').trim();
        if (pinAttempt === configuredPin || pinAttempt === fallbackPin || pinAttempt === DEFAULT_PIN) {
          const token = await computeExpectedToken(pinAttempt);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`
            }
          });
        }
        return new Response(JSON.stringify({ success: false, error: 'Invalid access PIN' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Malformed request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // -------------------------------------------------------------
    // C. ACCESS DENIED: STOP HERE! DO NOT WAKE OR FETCH INSTABOX!
    // -------------------------------------------------------------
    if (!isAuthorized) {
      const acceptHeader = request.headers.get('accept') || '';
      if (url.pathname.startsWith('/api/') || acceptHeader.includes('application/json')) {
        return new Response(JSON.stringify({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Cloudflare Edge Access Gate: Valid PIN or API Secret Key required.'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }

      // Return Swiss-grid Dark Mode PIN Login Screen
      return new Response(renderAuthGateHtml(), {
        status: 401,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // -------------------------------------------------------------
    // D. OPERATOR AUTHORIZED -> PROCEED TO AUTO-WAKE SHIELD LOGIC
    // -------------------------------------------------------------
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

function renderAuthGateHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Gate — Pin Arbitrage Engine</title>
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
      border-radius: 14px;
      max-width: 420px;
      width: 100%;
      padding: 2.25rem 2rem;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.85);
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
    .lock-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #E11D48;
      box-shadow: 0 0 8px #E11D48;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #FAFAFA;
      margin-bottom: 0.5rem;
    }
    p {
      font-size: 0.875rem;
      color: #A1A1AA;
      line-height: 1.5;
      margin-bottom: 1.75rem;
    }
    .input-group {
      position: relative;
      margin-bottom: 1.25rem;
    }
    .pin-input {
      width: 100%;
      background: #18181B;
      border: 1px solid #27272A;
      border-radius: 8px;
      padding: 0.875rem 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.05rem;
      color: #FAFAFA;
      letter-spacing: 0.1em;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .pin-input:focus {
      border-color: #E11D48;
      box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.25);
    }
    .btn-submit {
      width: 100%;
      background: #E11D48;
      border: none;
      border-radius: 8px;
      padding: 0.875rem 1rem;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #FAFAFA;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s ease, transform 0.05s ease;
    }
    .btn-submit:hover {
      background: #BE123C;
    }
    .btn-submit:active {
      transform: scale(0.99);
    }
    .error-msg {
      display: none;
      margin-top: 1rem;
      padding: 0.625rem 0.75rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 6px;
      color: #F87171;
      font-size: 0.8125rem;
      text-align: center;
    }
    .footer-note {
      margin-top: 1.5rem;
      font-size: 0.75rem;
      color: #52525B;
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="lock-dot"></span>
      Protected Operator Gateway
    </div>
    <h1>Pin Arbitrage Engine</h1>
    <p>Authentication required. Enter your security PIN to unlock the workspace.</p>

    <form id="authForm" onsubmit="handleAuth(event)">
      <div class="input-group">
        <input 
          id="pinInput" 
          type="password" 
          class="pin-input" 
          placeholder="Enter Access PIN..." 
          autocomplete="current-password"
          required 
          autofocus
        />
      </div>
      <button id="submitBtn" type="submit" class="btn-submit">
        Unlock Engine
      </button>
      <div id="errorMsg" class="error-msg"></div>
    </form>

    <div class="footer-note">
      Cloudflare Edge Verification • 0ms Wake Shield
    </div>
  </div>

  <script>
    async function handleAuth(e) {
      e.preventDefault();
      const pin = document.getElementById('pinInput').value.trim();
      const btn = document.getElementById('submitBtn');
      const err = document.getElementById('errorMsg');
      
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      err.style.display = 'none';

      try {
        const res = await fetch('/api/shield-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.success) {
          btn.textContent = 'Authorized! Redirecting...';
          window.location.reload();
        } else {
          err.textContent = data.error || 'Invalid PIN entered. Access denied.';
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Unlock Engine';
        }
      } catch (ex) {
        err.textContent = 'Connection error. Please try again.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Unlock Engine';
      }
    }
  </script>
</body>
</html>`;
}

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
      transition: width 6.5s cubic-bezier(0.1, 0.7, 0.1, 1);
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
      Connecting in <span id="sec" class="countdown">6</span>s...
    </div>
  </div>

  <script>
    requestAnimationFrame(() => {
      setTimeout(() => {
        const bar = document.getElementById('pfill');
        if (bar) bar.style.width = '100%';
      }, 50);
    });

    let remaining = 6;
    const secEl = document.getElementById('sec');
    let isRedirecting = false;

    async function checkReady() {
      if (isRedirecting) return;
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          isRedirecting = true;
          if (secEl) secEl.textContent = '0';
          window.location.reload();
        }
      } catch (e) {}
    }

    const timer = setInterval(() => {
      remaining -= 1;
      if (secEl && remaining >= 0) secEl.textContent = remaining;
      if (remaining <= 3) {
        checkReady();
      }
      if (remaining <= 0) {
        clearInterval(timer);
        if (!isRedirecting) {
          window.location.reload();
        }
      }
    }, 1000);
  </script>
</body>
</html>`;
}
