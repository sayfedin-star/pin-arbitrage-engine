/**
 * Pin Arbitrage Engine (PAE) - Cloudflare Edge Auto-Wake Shield & Access Gate
 *
 * 1. ZERO-TRUST ACCESS GATE: Validates operator credentials at Cloudflare Edge in 0ms.
 *    Unauthorized requests are blocked BEFORE touching or waking the InstaBox VM!
 * 2. PROACTIVE & RESILIENT AUTO-WAKE SHIELD:
 *    - Enforces a fast timeout on origin tunnel requests to defeat frozen "Zombie Tunnels".
 *    - Catches all 5xx/tunnel error codes (500, 502, 503, 504, 520-530).
 *    - Wakes stopped or suspended InstaBox VMs via official OpenAPI `POST /v1/machines/:id/start`
 *      with required `Idempotency-Key` (20s time-bucketed) and `{}` JSON body.
 *    - Proactively dispatches wake-up upon successful PIN authentication (`/api/shield-auth`).
 *    - Provides a dedicated lightweight `/api/shield-wake-status` endpoint that checks
 *      internal `/api/health` every 2s and throttles InstaBox metadata checks (`?meta=1`)
 *      to once every 6s to protect API rate limits.
 */

const MACHINE_ID = 'm_agq2t32m5xv5joj67rqoze5h4u';
const DEFAULT_PIN = 'pae2026';
const AUTH_COOKIE_NAME = 'pae_shield_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TUNNEL_DOWN_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 530]);

// Isolate-level throttling caches to protect InstaBox API rate limits
let lastWakeAt = 0;
let lastWakeResult = null;
let lastMetaCheckAt = 0;
let lastMetaState = null;

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

/**
 * Triggers InstaBox machine start/resume in full compliance with InstaBox OpenAPI 3.1.0:
 * - Route: POST /v1/machines/{id}/start (resumes suspended VMs AND starts stopped VMs)
 * - Header: Idempotency-Key (required by InstaBox for all mutating POST requests, bucketed to 20s)
 * - Body: JSON.stringify({}) (required when Content-Type is application/json)
 */
async function triggerInstaBoxWake(machineId, apiKey, { force = false } = {}) {
  if (!apiKey) {
    return { triggered: false, state: 'resuming', phase: 'no_api_key' };
  }

  const now = Date.now();
  if (!force && lastWakeResult && (now - lastWakeAt < 15000)) {
    return lastWakeResult;
  }

  const idempotencyBucket = Math.floor(now / 20000);
  const idempotencyKey = `wake-${machineId}-${idempotencyBucket}`;

  try {
    const res = await fetch(`https://api.instabox.sh/v1/machines/${machineId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000)
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      lastWakeResult = {
        triggered: true,
        httpStatus: res.status,
        operationId: data?.id || null,
        state: data?.machine?.state || data?.state || 'resuming',
        phase: data?.phase || 'booting',
        runtimeReady: Boolean(data?.machine?.runtime?.ready),
        errorCode: null,
        errorMessage: null,
        retryAfterSeconds: null
      };
    } else {
      const errObj = data?.error || {};
      const retryHeader = Number(res.headers.get('Retry-After'));
      lastWakeResult = {
        triggered: false,
        httpStatus: res.status,
        operationId: errObj.operationId || null,
        state: errObj.code === 'machine_cooldown' ? 'cooldown' : 'resuming',
        phase: errObj.code || `http_${res.status}`,
        runtimeReady: false,
        errorCode: errObj.code || null,
        errorMessage: errObj.message || null,
        retryAfterSeconds: errObj.retryAfterSeconds || (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : null)
      };
    }
    lastWakeAt = now;
    return lastWakeResult;
  } catch (err) {
    return {
      triggered: false,
      state: 'resuming',
      phase: 'dispatch_retry',
      errorCode: null,
      errorMessage: err?.message || 'Network error contacting InstaBox API',
      retryAfterSeconds: null
    };
  }
}

/**
 * Throttled metadata check (at most once every 6 seconds per isolate)
 * Only invoked when browser explicitly requests `/api/shield-wake-status?meta=1`.
 */
async function getThrottledInstaBoxMeta(machineId, apiKey, ctx) {
  if (!apiKey) return lastWakeResult || null;

  const now = Date.now();
  if (lastMetaState && (now - lastMetaCheckAt < 5500)) {
    return lastMetaState;
  }

  try {
    const res = await fetch(`https://api.instabox.sh/v1/machines/${machineId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok) {
      const machine = await res.json().catch(() => ({}));
      const state = machine?.state || 'resuming';
      const runtimeReady = Boolean(machine?.runtime?.ready);
      const cooldownUntil = machine?.cooldownUntil || null;

      // If the VM is still stopped or suspended and not in cooldown, re-trigger start
      if ((state === 'suspended' || state === 'stopped') && !cooldownUntil) {
        const wakePromise = triggerInstaBoxWake(machineId, apiKey);
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(wakePromise);
        }
      }

      lastMetaState = {
        state,
        phase: runtimeReady ? 'waiting_tunnel' : state,
        runtimeReady,
        cooldownUntil,
        errorCode: lastWakeResult?.errorCode || null,
        retryAfterSeconds: lastWakeResult?.retryAfterSeconds || null
      };
      lastMetaCheckAt = now;
      return lastMetaState;
    }
  } catch (_) {}

  return lastMetaState || lastWakeResult || null;
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
      (headerApiKey && (headerApiKey === configuredPin || headerApiKey === fallbackPin || headerApiKey === DEFAULT_PIN)) ||
      (bearerToken && (bearerToken === configuredPin || bearerToken === fallbackPin || bearerToken === DEFAULT_PIN))
    ) {
      isAuthorized = true;
    }

    // 3. Check URL Query Parameter (?pin=... or ?key=...)
    const queryPin = url.searchParams.get('pin') || url.searchParams.get('key');
    if (queryPin && (queryPin === configuredPin || queryPin === fallbackPin || queryPin === DEFAULT_PIN)) {
      const token = await computeExpectedToken(queryPin);
      if (apiKey) {
        const wakePromise = triggerInstaBoxWake(machineId, apiKey);
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(wakePromise);
      }
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
          // Proactively wake the InstaBox VM immediately upon valid PIN authentication!
          if (apiKey) {
            const wakePromise = triggerInstaBoxWake(machineId, apiKey);
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(wakePromise);
            }
          }
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
      } catch (_) {
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

    // Inject secret API key automatically for authenticated operator so UI never prompts
    const originHeaders = new Headers(request.headers);
    const secretKeyToInject = env.API_SECRET_KEY || fallbackPin;
    if (secretKeyToInject && !originHeaders.has('x-api-key')) {
      originHeaders.set('x-api-key', secretKeyToInject);
    }

    // -------------------------------------------------------------
    // D. DEDICATED WAKE POLLING ENDPOINT (GET /api/shield-wake-status)
    //    - Checks internal tunnel `/api/health` first (fast 2.5s timeout).
    //    - Only touches InstaBox API when `?meta=1` is passed (every 6s).
    // -------------------------------------------------------------
    if (url.pathname === '/api/shield-wake-status') {
      try {
        const healthUrl = new URL('/api/health', url.origin);
        const healthReq = new Request(healthUrl.toString(), {
          method: 'GET',
          headers: {
            'x-api-key': secretKeyToInject,
            'accept': 'application/json'
          },
          signal: AbortSignal.timeout(2500)
        });
        const healthRes = await fetch(healthReq);
        if (healthRes.ok) {
          return new Response(JSON.stringify({
            ready: true,
            state: 'running',
            phase: 'ready'
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
          });
        }
      } catch (_) {
        // Tunnel still waking
      }

      const wantMeta = url.searchParams.get('meta') === '1';
      const meta = wantMeta
        ? await getThrottledInstaBoxMeta(machineId, apiKey, ctx)
        : (lastMetaState || lastWakeResult);

      return new Response(JSON.stringify({
        ready: false,
        state: meta?.state || 'resuming',
        phase: meta?.phase || 'booting',
        runtimeReady: Boolean(meta?.runtimeReady),
        cooldownUntil: meta?.cooldownUntil || null,
        errorCode: meta?.errorCode || null,
        retryAfterSeconds: meta?.retryAfterSeconds || null
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // -------------------------------------------------------------
    // E. OPERATOR AUTHORIZED -> PROCEED TO AUTO-WAKE SHIELD LOGIC
    // -------------------------------------------------------------
    let response;
    let isDown = false;

    const isNavigationOrHealth =
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      url.pathname === '/api/health';
    const timeoutMs = isNavigationOrHealth ? 3500 : 12000;

    try {
      const originRequest = new Request(request, {
        headers: originHeaders,
        signal: AbortSignal.timeout(timeoutMs)
      });

      // 1. Attempt to pass through to origin tunnel
      response = await fetch(originRequest);

      // Catch only genuine gateway/tunnel offline statuses (502, 503, 504, 521, 522, 523, 524, 530)
      // Do NOT intercept HTTP 500 application errors when the machine is already awake
      if (TUNNEL_DOWN_STATUSES.has(response.status)) {
        isDown = true;
      }
    } catch (_) {
      // Direct network/fetch error or AbortSignal timeout when tunnel is frozen/offline
      isDown = true;
    }

    // Tunnel is alive and healthy: pass through immediately with zero overhead
    if (!isDown && response) {
      return response;
    }

    // 2. Machine is asleep! Trigger wake-up via InstaBox OpenAPI (`POST /v1/machines/:id/start`)
    let wakeInfo = lastWakeResult;
    if (apiKey) {
      const acceptHeader = request.headers.get('accept') || '';
      const isHtmlVisit = !url.pathname.startsWith('/api/') && !acceptHeader.includes('application/json');
      if (isHtmlVisit) {
        // Await initial wake response (up to 5s) so we immediately know if VM is booting or in cooldown
        wakeInfo = await triggerInstaBoxWake(machineId, apiKey);
      } else {
        const wakePromise = triggerInstaBoxWake(machineId, apiKey);
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(wakePromise);
        } else {
          wakeInfo = await wakePromise;
        }
      }
    }

    // 3. API client requesting JSON -> Return structured retry JSON
    const acceptHeader = request.headers.get('accept') || '';
    if (url.pathname.startsWith('/api/') || acceptHeader.includes('application/json')) {
      const retrySec = wakeInfo?.retryAfterSeconds || 3;
      return new Response(JSON.stringify({
        status: wakeInfo?.state || 'resuming',
        phase: wakeInfo?.phase || 'booting',
        errorCode: wakeInfo?.errorCode || null,
        message: wakeInfo?.errorCode === 'machine_cooldown'
          ? `PAE instance is in mandatory max-run cooldown. Retry in ${retrySec}s.`
          : 'PAE dedicated instance is waking up from idle state. Retry in 3 seconds.',
        retryAfter: retrySec,
        machineId
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // 4. Browser visit -> Render Swiss-grid Dark Mode Smart Waking Splash Screen
    return new Response(renderWakingHtml(machineId, wakeInfo), {
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
      btn.textContent = 'Verifying & Waking Engine...';
      err.style.display = 'none';

      try {
        const res = await fetch('/api/shield-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.success) {
          btn.textContent = 'Authorized! Connecting...';
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

function renderWakingHtml(machineId, initialWakeInfo = null) {
  const initialDataJson = JSON.stringify({
    state: initialWakeInfo?.state || 'resuming',
    phase: initialWakeInfo?.phase || 'booting',
    errorCode: initialWakeInfo?.errorCode || null,
    retryAfterSeconds: initialWakeInfo?.retryAfterSeconds || null
  });

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
      margin-bottom: 0.75rem;
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
      margin-top: 1.25rem;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .progress-fill {
      background: #E11D48;
      height: 100%;
      width: 8%;
      border-radius: 9999px;
      transition: width 1.8s cubic-bezier(0.22, 1, 0.36, 1);
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
    .btn-retry {
      display: none;
      margin: 1rem auto 0;
      background: #27272A;
      border: 1px solid #3F3F46;
      color: #FAFAFA;
      font-family: 'Geist', sans-serif;
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-retry:hover {
      background: #3F3F46;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="pulse-dot"></span>
      Instant Wake Protocol
    </div>
    <h1 id="titleText">Waking Engine Instance</h1>
    <p id="descText">The dedicated PAE database and crawler instance is resuming from idle state. Your workspace will open automatically as soon as the tunnel connects.</p>
    
    <div class="telemetry-row">
      <span>Target Instance</span>
      <span class="telemetry-val">${machineId.slice(0, 14)}...</span>
    </div>
    <div class="telemetry-row">
      <span>Lifecycle Phase</span>
      <span id="phaseLabel" class="telemetry-val">Dispatching Start...</span>
    </div>

    <div class="progress-bar-container">
      <div id="pfill" class="progress-fill"></div>
    </div>

    <div id="statusLine" class="status-text">
      Verifying tunnel readiness (<span id="sec" class="countdown">0s</span> elapsed)...
    </div>
    <button id="retryBtn" class="btn-retry" onclick="window.location.reload()">Retry Connection Now</button>
  </div>

  <script>
    const initialInfo = ${initialDataJson};
    const bar = document.getElementById('pfill');
    const secEl = document.getElementById('sec');
    const phaseEl = document.getElementById('phaseLabel');
    const titleEl = document.getElementById('titleText');
    const descEl = document.getElementById('descText');
    const statusLine = document.getElementById('statusLine');
    const retryBtn = document.getElementById('retryBtn');

    let elapsedSec = 0;
    let pollTick = 0;
    let isRedirecting = false;

    function applyStatusUI(info) {
      if (!info) return;
      if (info.errorCode === 'machine_cooldown') {
        const waitMin = info.retryAfterSeconds ? Math.ceil(info.retryAfterSeconds / 60) : 5;
        if (titleEl) titleEl.textContent = 'Instance Cooldown Active';
        if (descEl) descEl.textContent = 'InstaBox enforced a brief cooldown after reaching the continuous runtime limit. Will resume automatically once cooldown clears.';
        if (phaseEl) phaseEl.textContent = 'Cooldown (~' + waitMin + ' min)';
        if (retryBtn) retryBtn.style.display = 'inline-block';
        return;
      }

      if (info.runtimeReady || info.phase === 'waiting_tunnel') {
        if (phaseEl) phaseEl.textContent = 'VM Ready • Connecting Tunnel';
        if (bar) bar.style.width = '85%';
      } else if (info.state === 'running') {
        if (phaseEl) phaseEl.textContent = 'Starting Services...';
        if (bar) bar.style.width = '70%';
      } else if (info.state === 'resuming' || info.state === 'starting') {
        if (phaseEl) phaseEl.textContent = 'Resuming Sandbox (' + (info.phase || 'booting') + ')';
      }
    }

    applyStatusUI(initialInfo);

    async function pollWakeStatus() {
      if (isRedirecting) return;
      pollTick += 1;
      // Only request InstaBox metadata (?meta=1) every 3rd poll (every 6 seconds) to protect API rate limits
      const query = (pollTick % 3 === 0) ? '?meta=1' : '';
      try {
        const res = await fetch('/api/shield-wake-status' + query, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ready) {
          isRedirecting = true;
          if (bar) bar.style.width = '100%';
          if (phaseEl) phaseEl.textContent = 'Tunnel Connected • Ready';
          if (statusLine) statusLine.textContent = 'Connected! Launching workspace...';
          window.location.reload();
          return;
        }
        applyStatusUI(data);
      } catch (_) {}
    }

    const secTimer = setInterval(() => {
      if (isRedirecting) return;
      elapsedSec += 1;
      if (secEl) secEl.textContent = elapsedSec + 's';
      if (bar && elapsedSec <= 18) {
        const pct = Math.min(82, 12 + Math.round((elapsedSec / 18) * 68));
        if (parseFloat(bar.style.width || '8') < pct) {
          bar.style.width = pct + '%';
        }
      }
      if (elapsedSec >= 30 && retryBtn) {
        retryBtn.style.display = 'inline-block';
      }
    }, 1000);

    const pollTimer = setInterval(() => {
      if (isRedirecting) {
        clearInterval(pollTimer);
        clearInterval(secTimer);
        return;
      }
      if (elapsedSec <= 60) {
        pollWakeStatus();
      } else {
        clearInterval(pollTimer);
      }
    }, 2000);

    // First check after 1.5s
    setTimeout(pollWakeStatus, 1500);
  </script>
</body>
</html>`;
}
