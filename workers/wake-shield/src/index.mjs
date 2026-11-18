/**
 * Pin Arbitrage Engine (PAE) - Cloudflare Edge Auto-Wake Shield & Access Gate
 *
 * 1. ZERO-TRUST ACCESS GATE:
 *    - Issues HMAC-SHA256 expiring cookies (<expUnixSec>.<hmacSha256Hex>) with SameSite=Strict.
 *    - Enforces per-IP PIN brute-force rate limiting (max 5 failures / 10m -> 429 + Retry-After).
 *    - Enforces same-origin CSRF validation on mutating cookie-authenticated requests BEFORE
 *      injecting x-api-key or waking/proxying the InstaBox origin.
 * 2. PROACTIVE & RESILIENT AUTO-WAKE SHIELD:
 *    - Enforces fast timeouts on origin tunnel requests to defeat frozen tunnels.
 *    - Catches gateway/tunnel offline statuses (502, 503, 504, 520-530).
 *    - Wakes stopped or suspended InstaBox VMs via official OpenAPI `POST /v1/machines/:id/start`
 *      with required `Idempotency-Key` (20s time-bucketed) and `{}` JSON body.
 */

const MACHINE_ID = 'm_agq2t32m5xv5joj67rqoze5h4u';
const AUTH_COOKIE_NAME = 'pae_shield_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)
const PIN_FAIL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const PIN_MAX_FAILURES = 5;
const PIN_RATE_MAP_MAX_SIZE = 2000;
const TUNNEL_DOWN_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 530]);

// Isolate-level throttling & brute-force protection stores
let lastWakeAt = 0;
let lastWakeResult = null;
let lastMetaCheckAt = 0;
let lastMetaState = null;
const pinFailureStore = new Map();

export function _resetWakeShieldState() {
  lastWakeAt = 0;
  lastWakeResult = null;
  lastMetaCheckAt = 0;
  lastMetaState = null;
  pinFailureStore.clear();
}

async function computeHmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${secret}:pae_shield_hmac_v1`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const sigArr = Array.from(new Uint8Array(sigBuf));
  return sigArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string equality check using WebCrypto SHA-256 digests + XOR loop.
 */
async function timingSafeEqualWebCrypto(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= (bytesA[i] ^ bytesB[i]);
  }
  return diff === 0 && a.length === b.length;
}

/**
 * Constant-time membership check across an array of valid secrets.
 */
async function timingSafeIncludes(candidateOrList, allowedOrCandidate) {
  const candidate = typeof candidateOrList === 'string'
    ? candidateOrList
    : (typeof allowedOrCandidate === 'string' ? allowedOrCandidate : null);
  const allowedValues = Array.isArray(allowedOrCandidate)
    ? allowedOrCandidate
    : (Array.isArray(candidateOrList) ? candidateOrList : null);

  if (!candidate || !allowedValues || allowedValues.length === 0) return false;

  let matchFound = false;
  for (const item of allowedValues) {
    if (await timingSafeEqualWebCrypto(candidate, String(item))) {
      matchFound = true;
    }
  }
  return matchFound;
}

/**
 * Issues an expiring `<expUnixSec>.<hmacSha256Hex>` cookie token.
 */
export async function issueShieldCookieToken(secret, nowMs = Date.now(), maxAgeSec = COOKIE_MAX_AGE) {
  const expUnixSec = Math.floor(nowMs / 1000) + Math.max(1, Math.floor(maxAgeSec));
  const expStr = String(expUnixSec);
  const hmacHex = await computeHmacSha256Hex(secret, expStr);
  return `${expStr}.${hmacHex}`;
}

/**
 * Verifies `<expUnixSec>.<hmacSha256Hex>` cookie token in constant time with expiry enforcement.
 */
export async function verifyShieldCookieToken(cookieValue, validSecrets, nowMs = Date.now()) {
  if (typeof cookieValue !== 'string' || !Array.isArray(validSecrets) || validSecrets.length === 0) {
    return false;
  }
  const dotIdx = cookieValue.indexOf('.');
  if (dotIdx <= 0 || cookieValue.indexOf('.', dotIdx + 1) !== -1) {
    return false;
  }
  const expStr = cookieValue.slice(0, dotIdx);
  const providedHmac = cookieValue.slice(dotIdx + 1).toLowerCase();
  if (!/^\d{1,15}$/.test(expStr) || !/^[0-9a-f]{64}$/.test(providedHmac)) {
    return false;
  }

  const expUnixSec = Number(expStr);
  const isUnexpired = Number.isSafeInteger(expUnixSec) && (nowMs / 1000) < expUnixSec;

  let hmacValid = false;
  for (const secret of validSecrets) {
    const expectedHmac = await computeHmacSha256Hex(String(secret), expStr);
    if (await timingSafeEqualWebCrypto(providedHmac, expectedHmac)) {
      hmacValid = true;
    }
  }

  return hmacValid && isUnexpired;
}

/**
 * Escapes `<`, `>`, and `&` for safe embedding inside HTML `<script>` blocks.
 */
export function serializeSafeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getClientIpKey(request) {
  const cfIp = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (cfIp) return cfIp;
  const xff = (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  return xff || 'unknown';
}

function prunePinFailureStore(nowMs) {
  for (const [ip, timestamps] of pinFailureStore.entries()) {
    const recent = timestamps.filter((ts) => nowMs - ts < PIN_FAIL_WINDOW_MS);
    if (recent.length === 0) {
      pinFailureStore.delete(ip);
    } else {
      pinFailureStore.set(ip, recent);
    }
  }
  while (pinFailureStore.size > PIN_RATE_MAP_MAX_SIZE) {
    const oldestKey = pinFailureStore.keys().next().value;
    if (oldestKey === undefined) break;
    pinFailureStore.delete(oldestKey);
  }
}

function checkPinRateLimit(ipKey, nowMs = Date.now()) {
  const existing = pinFailureStore.get(ipKey);
  if (!existing || existing.length === 0) {
    return { limited: false, retryAfterSec: 0 };
  }
  const recent = existing.filter((ts) => nowMs - ts < PIN_FAIL_WINDOW_MS);
  if (recent.length === 0) {
    pinFailureStore.delete(ipKey);
    return { limited: false, retryAfterSec: 0 };
  }
  pinFailureStore.set(ipKey, recent);
  if (recent.length >= PIN_MAX_FAILURES) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((PIN_FAIL_WINDOW_MS - (nowMs - oldest)) / 1000));
    return { limited: true, retryAfterSec };
  }
  return { limited: false, retryAfterSec: 0 };
}

function recordPinFailure(ipKey, nowMs = Date.now()) {
  if (!pinFailureStore.has(ipKey) && pinFailureStore.size >= PIN_RATE_MAP_MAX_SIZE) {
    prunePinFailureStore(nowMs);
    if (pinFailureStore.size >= PIN_RATE_MAP_MAX_SIZE) {
      const oldestKey = pinFailureStore.keys().next().value;
      if (oldestKey !== undefined) pinFailureStore.delete(oldestKey);
    }
  }
  const existing = (pinFailureStore.get(ipKey) || []).filter((ts) => nowMs - ts < PIN_FAIL_WINDOW_MS);
  existing.push(nowMs);
  pinFailureStore.set(ipKey, existing);
}

function parseCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

/**
 * Normalizes logout redirect targets strictly to a single-slash same-origin path.
 */
function resolveSafeLogoutLocation(url) {
  const cleanSearch = new URLSearchParams(url.searchParams);
  cleanSearch.delete('logout');
  const rawPath = url.pathname === '/logout' ? '/' : url.pathname;
  const singleSlashPath = '/' + rawPath.replace(/^\/+/, '').replace(/^\\+/, '');
  const querySuffix = cleanSearch.toString() ? `?${cleanSearch.toString()}` : '';
  const cleanTarget = singleSlashPath === '/logout' ? '/' : `${singleSlashPath}${querySuffix}`;

  try {
    const resolved = new URL(cleanTarget, url.origin);
    if (resolved.origin !== url.origin) {
      return '/';
    }
    const finalPath = '/' + resolved.pathname.replace(/^\/+/, '').replace(/^\\+/, '');
    return `${finalPath}${resolved.search}`;
  } catch (_) {
    return '/';
  }
}

/**
 * Triggers InstaBox machine start/resume in compliance with InstaBox OpenAPI 3.1.0:
 * - Route: POST /v1/machines/{id}/start
 * - Header: Idempotency-Key (20s time-bucketed)
 * - Body: JSON.stringify({})
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
    const nowMs = Date.now();

    // Fail-closed: require explicit SHIELD_PIN or API_SECRET_KEY in Worker environment
    const validPins = [];
    if (env.SHIELD_PIN) validPins.push(String(env.SHIELD_PIN));
    if (env.API_SECRET_KEY && !validPins.includes(String(env.API_SECRET_KEY))) {
      validPins.push(String(env.API_SECRET_KEY));
    }
    if (validPins.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'AUTH_NOT_CONFIGURED',
        message: 'Wake Shield misconfigured: SHIELD_PIN or API_SECRET_KEY is required.'
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    const url = new URL(request.url);
    const methodUpper = (request.method || 'GET').toUpperCase();

    // -------------------------------------------------------------
    // A. LOGOUT HANDLER (?logout=true or /logout)
    // -------------------------------------------------------------
    if (url.searchParams.get('logout') === 'true' || url.pathname === '/logout') {
      const cleanLocation = resolveSafeLogoutLocation(url);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': cleanLocation,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Set-Cookie': `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`
        }
      });
    }

    // -------------------------------------------------------------
    // B. AJAX PIN SUBMISSION (POST /api/shield-auth) WITH RATE LIMIT
    // -------------------------------------------------------------
    if (methodUpper === 'POST' && url.pathname === '/api/shield-auth') {
      const ipKey = getClientIpKey(request);
      const rateCheck = checkPinRateLimit(ipKey, nowMs);
      if (rateCheck.limited) {
        return new Response(JSON.stringify({
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: `Too many failed PIN attempts. Retry after ${rateCheck.retryAfterSec} seconds.`,
          retryAfter: rateCheck.retryAfterSec
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateCheck.retryAfterSec),
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }

      try {
        const body = await request.json();
        const pinAttempt = typeof body?.pin === 'string' ? body.pin.trim() : '';
        if (pinAttempt && (await timingSafeIncludes(pinAttempt, validPins))) {
          pinFailureStore.delete(ipKey);
          const signingSecret = validPins[0];
          const token = await issueShieldCookieToken(signingSecret, nowMs, COOKIE_MAX_AGE);
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
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Set-Cookie': `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Strict; Secure`
            }
          });
        }

        recordPinFailure(ipKey, nowMs);
        return new Response(JSON.stringify({ success: false, error: 'Invalid access PIN' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      } catch (_) {
        return new Response(JSON.stringify({ success: false, error: 'Malformed request' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
    }

    // -------------------------------------------------------------
    // C. AUTHENTICATION VERIFICATION (Distinguish header vs cookie)
    // -------------------------------------------------------------
    let isAuthorized = false;
    let authSource = null;

    // 1. Check HTTP Headers (x-api-key or Authorization Bearer)
    const headerApiKey = request.headers.get('x-api-key') || '';
    const authHeader = request.headers.get('Authorization') || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    if (
      (headerApiKey && (await timingSafeIncludes(headerApiKey, validPins))) ||
      (bearerToken && (await timingSafeIncludes(bearerToken, validPins)))
    ) {
      isAuthorized = true;
      authSource = 'header';
    } else {
      // 2. Check HMAC-SHA256 Expiring Cookie
      const clientToken = parseCookie(request, AUTH_COOKIE_NAME);
      if (clientToken && (await verifyShieldCookieToken(clientToken, validPins, nowMs))) {
        isAuthorized = true;
        authSource = 'cookie';
      }
    }

    // -------------------------------------------------------------
    // D. ACCESS DENIED: STOP HERE! DO NOT WAKE OR FETCH INSTABOX!
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

      return new Response(renderAuthGateHtml(), {
        status: 401,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // -------------------------------------------------------------
    // E. STRICT CSRF & SAME-ORIGIN GATE BEFORE x-api-key INJECTION
    // -------------------------------------------------------------
    const isSafeMethod = methodUpper === 'GET' || methodUpper === 'HEAD' || methodUpper === 'OPTIONS';
    if (authSource === 'cookie' && !isSafeMethod) {
      const reqOrigin = (request.headers.get('Origin') || '').trim();
      const rawSecFetchSite = request.headers.get('Sec-Fetch-Site');
      const secFetchSite = rawSecFetchSite !== null ? rawSecFetchSite.trim().toLowerCase() : null;
      const originMatches = reqOrigin === url.origin;
      const secFetchAllowed = !secFetchSite || secFetchSite === 'same-origin';

      if (!originMatches || !secFetchAllowed) {
        return new Response(JSON.stringify({
          success: false,
          error: 'FORBIDDEN',
          message: 'Cross-origin mutating request rejected by Edge CSRF gate.'
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
    }

    // Inject secret API key ONLY after authentication + CSRF verification pass
    const originHeaders = new Headers(request.headers);
    const secretKeyToInject = env.API_SECRET_KEY || env.SHIELD_PIN || '';
    if (secretKeyToInject && !originHeaders.has('x-api-key')) {
      originHeaders.set('x-api-key', secretKeyToInject);
    }

    // -------------------------------------------------------------
    // F. DEDICATED WAKE POLLING ENDPOINT (GET /api/shield-wake-status)
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
    // G. OPERATOR AUTHORIZED -> PROCEED TO AUTO-WAKE SHIELD LOGIC
    // -------------------------------------------------------------
    let response;
    let isDown = false;

    const acceptHeader = request.headers.get('accept') || '';
    const isApi = url.pathname.startsWith('/api/');
    const isHealthProbe = url.pathname === '/api/health';
    const isBrowserNavigation = !isApi && (
      request.mode === 'navigate' ||
      acceptHeader.includes('text/html') ||
      ((methodUpper === 'GET' || methodUpper === 'HEAD') && !acceptHeader.includes('application/json'))
    );
    const timeoutMs = (isBrowserNavigation || isHealthProbe) ? 3500 : 15000;

    try {
      const originRequest = new Request(request, {
        headers: originHeaders,
        signal: AbortSignal.timeout(timeoutMs)
      });

      response = await fetch(originRequest);

      if (TUNNEL_DOWN_STATUSES.has(response.status)) {
        isDown = true;
      }
    } catch (_) {
      isDown = true;
    }

    if (!isDown && response) {
      return response;
    }

    let vpsAwake = false;
    if (!isHealthProbe) {
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
          vpsAwake = true;
        }
      } catch (_) {
        vpsAwake = false;
      }
    }

    if (vpsAwake) {
      if (response) {
        return response;
      }
      const isJsonRequest = isApi || acceptHeader.includes('application/json');
      if (isJsonRequest) {
        return new Response(JSON.stringify({
          success: false,
          error: 'GATEWAY_TIMEOUT',
          message: `Origin request to '${url.pathname}' timed out after ${timeoutMs}ms, but VPS instance is awake and healthy.`
        }), {
          status: 504,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
      return new Response(`<!DOCTYPE html><html lang="en" class="dark"><body style="background:#09090b;color:#fafafa;font-family:sans-serif;padding:40px;text-align:center;"><h2>Origin Request Timeout</h2><p>The request timed out after ${timeoutMs}ms, but the server is awake and healthy. Please reload.</p></body></html>`, {
        status: 504,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // Machine is asleep -> Trigger wake-up via InstaBox OpenAPI
    let wakeInfo = lastWakeResult;
    if (apiKey) {
      const isHtmlVisit = !url.pathname.startsWith('/api/') && !acceptHeader.includes('application/json');
      if (isHtmlVisit) {
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

    if (url.pathname.startsWith('/api/') || acceptHeader.includes('application/json')) {
      const retrySec = wakeInfo?.retryAfterSeconds || 3;
      return new Response(JSON.stringify({
        status: wakeInfo?.state || 'resuming',
        phase: wakeInfo?.phase || 'booting',
        errorCode: wakeInfo?.errorCode || null,
        message: wakeInfo?.errorCode === 'machine_cooldown'
          ? `PAE instance is in mandatory max-run cooldown. Retry in ${retrySec}s.`
          : 'PAE dedicated instance is waking up from idle state. Retry in 3 seconds.',
        retryAfter: retrySec
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    return new Response(renderWakingHtml(wakeInfo), {
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
          err.textContent = data.message || data.error || 'Invalid PIN entered. Access denied.';
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

export function renderWakingHtml(initialWakeInfo = null) {
  const initialDataJson = serializeSafeJsonForScript({
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
      <span class="telemetry-val">pae-dedicated-origin</span>
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

    setTimeout(pollWakeStatus, 1500);
  </script>
</body>
</html>`;
}
