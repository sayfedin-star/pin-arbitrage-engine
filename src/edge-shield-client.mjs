/**
 * Edge Shield Universal Client Hooks & Safe UI API Client
 * Injected across all UI studios (/keywords, /domains, /discovery, /folders, /)
 * Provides:
 * 0. Safe UI API Client (15s AbortSignal timeout, 502/504 HTML cold-start guard)
 * 1. User Activity Tracking (Inactivity Cutoff: 15 minutes)
 * 2. Operator Session Keep-Alive Heartbeat (4-min interval, 0 shards woken up)
 * 3. Smart Prefetch on Hover (120ms debounce, wakes up ONLY target shard O(1))
 */

/**
 * Universal safe fetch client helper for browser and edge module contexts
 * [INVARIANT: SAFE-UI-API-CLIENT]
 * Enforces AbortSignal.timeout(15000) and defends against Cloudflare 502/504 HTML responses.
 */
export async function safeApiFetch(url, options = {}) {
  const timeoutMs = options.timeout || 15000;
  const opts = { ...options };
  delete opts.timeout;

  if (!opts.signal) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      opts.signal = AbortSignal.timeout(timeoutMs);
    } else if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      opts.signal = controller.signal;
      setTimeout(() => {
        try { controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)); } catch (_) {}
      }, timeoutMs);
    }
  }

  let rawRes;
  try {
    rawRes = await fetch(url, opts);
  } catch (err) {
    const isTimeout = err && (err.name === 'TimeoutError' || /timeout|aborted/i.test(err.message));
    if (isTimeout) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (server or database cold-start). Please retry.`);
    }
    throw err;
  }

  const contentType = (rawRes.headers && rawRes.headers.get('content-type')) || '';
  const isJson = contentType.includes('application/json');
  let parsedData = null;
  let rawText = '';

  if (isJson) {
    try {
      parsedData = await rawRes.json();
    } catch (jsonErr) {
      parsedData = {
        success: false,
        ok: false,
        error: `Failed to parse JSON response: ${jsonErr.message}`,
        status: rawRes.status
      };
    }
  } else {
    try {
      rawText = await rawRes.text();
    } catch (_) {}
    const isColdStartOrGateway = rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504;
    parsedData = {
      success: rawRes.ok,
      ok: rawRes.ok,
      error: isColdStartOrGateway
        ? `Upstream database or gateway cold start (HTTP ${rawRes.status}). Please retry in a few seconds.`
        : (rawRes.ok ? null : (rawText || `HTTP ${rawRes.status}: ${rawRes.statusText || 'Error'}`)),
      message: isColdStartOrGateway
        ? `Upstream database or gateway cold start (HTTP ${rawRes.status}). Please retry in a few seconds.`
        : rawText,
      raw_text: rawText,
      status: rawRes.status
    };
  }

  return {
    ok: rawRes.ok,
    status: rawRes.status,
    statusText: rawRes.statusText,
    headers: rawRes.headers,
    url: rawRes.url,
    redirected: rawRes.redirected,
    type: rawRes.type,
    data: parsedData,
    raw: rawRes,
    async json() {
      return parsedData;
    },
    async text() {
      return rawText || (typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData));
    },
    clone() {
      return typeof rawRes.clone === 'function' ? rawRes.clone() : this;
    }
  };
}

export const apiFetch = safeApiFetch;

export function getEdgeShieldClientScript() {
  return `<script>
  (function installEdgeShieldClientHooks() {
    if (typeof window === 'undefined') return;

    // 0. Safe UI API Client & Cold Start Protection (15s timeout, 502/504 HTML guard)
    // [INVARIANT: SAFE-UI-API-CLIENT]
    if (!window.safeApiFetch) {
      window.safeApiFetch = async function safeApiFetch(url, options) {
        options = options || {};
        var timeoutMs = options.timeout || 15000;
        var fetchOptions = Object.assign({}, options);
        delete fetchOptions.timeout;

        if (!fetchOptions.signal) {
          if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            fetchOptions.signal = AbortSignal.timeout(timeoutMs);
          } else if (typeof AbortController !== 'undefined') {
            var controller = new AbortController();
            fetchOptions.signal = controller.signal;
            setTimeout(function() {
              try { controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')); } catch (_) {}
            }, timeoutMs);
          }
        }

        var rawRes;
        try {
          rawRes = await fetch(url, fetchOptions);
        } catch (networkErr) {
          var isTimeout = networkErr && (networkErr.name === 'TimeoutError' || /timeout|aborted/i.test(networkErr.message));
          if (isTimeout) {
            throw new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + 's (server or database cold-start). Please retry.');
          }
          throw networkErr;
        }

        var contentType = (rawRes.headers && rawRes.headers.get('content-type')) || '';
        var isJson = contentType.indexOf('application/json') !== -1;
        var parsedData = null;
        var rawText = '';

        if (isJson) {
          try {
            parsedData = await rawRes.json();
          } catch (jsonErr) {
            parsedData = {
              success: false,
              ok: false,
              error: 'Failed to parse JSON response: ' + jsonErr.message,
              status: rawRes.status
            };
          }
        } else {
          try {
            rawText = await rawRes.text();
          } catch (_) {}
          var isColdStartOrGateway = rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504;
          parsedData = {
            success: rawRes.ok,
            ok: rawRes.ok,
            error: isColdStartOrGateway
              ? 'Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.'
              : (rawRes.ok ? null : (rawText || ('HTTP ' + rawRes.status + ': ' + (rawRes.statusText || 'Error')))),
            message: isColdStartOrGateway
              ? 'Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.'
              : rawText,
            raw_text: rawText,
            status: rawRes.status
          };
        }

        return {
          ok: rawRes.ok,
          status: rawRes.status,
          statusText: rawRes.statusText,
          headers: rawRes.headers,
          url: rawRes.url,
          redirected: rawRes.redirected,
          type: rawRes.type,
          data: parsedData,
          raw: rawRes,
          json: async function() { return parsedData; },
          text: async function() { return rawText || (typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)); },
          clone: function() { return (typeof rawRes.clone === 'function') ? rawRes.clone() : this; }
        };
      };
      window.apiFetch = window.safeApiFetch;
    }

    if (window.__edgeShieldInstalled) return;
    window.__edgeShieldInstalled = true;

    // 1. User Activity Tracker (Inactivity cutoff: 15 minutes)
    var lastUserActivity = Date.now();
    var INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
    var markActive = function() { lastUserActivity = Date.now(); };
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
      window.addEventListener(evt, markActive, { passive: true });
    });

    // 2. Operator Session Keep-Alive Heartbeat (4-min interval)
    // Only fires if tab is visible AND user was active within last 15 minutes
    // Sends body '{}' -> 0 shards awakened, keeps Cloudflare Worker & Hub warm
    setInterval(function() {
      if (document.hidden) return;
      if (Date.now() - lastUserActivity > INACTIVITY_TIMEOUT_MS) return;
      fetch('/api/fleet/keep-alive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).catch(function() {});
    }, 240000);

    // 3. Smart Prefetch & Predictive JIT Warming on Hover (130ms debounce)
    // [INVARIANT: PREDICTIVE-HOVER-JIT-WARMING]
    // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
    // 1. Fast Edge Prefetch (< 3ms) from Cloudflare D1 / KV cache
    // 2. Predictive JIT Warming ping to background-wake target shard before click navigation
    var hoverPrefetchTimer = null;
    var prefetchCache = new Set();
    var warmCache = new Set();

    document.addEventListener('mouseover', function(e) {
      var pinCard = e.target.closest('[data-pin-id], a[href*="/pin/"], a[href*="/pins/"]');
      if (!pinCard) {
        if (hoverPrefetchTimer) { clearTimeout(hoverPrefetchTimer); hoverPrefetchTimer = null; }
        return;
      }
      var pid = pinCard.getAttribute('data-pin-id');
      if (!pid && pinCard.href) {
        var match = pinCard.href.match(/\\/pins?\\/([0-9]{10,})/);
        if (match) pid = match[1];
      }
      if (pid && pid.length >= 10 && !isNaN(Number(pid))) {
        if (hoverPrefetchTimer) clearTimeout(hoverPrefetchTimer);
        hoverPrefetchTimer = setTimeout(function() {
          // A. Edge Prefetch (< 3ms) from D1/KV
          if (!prefetchCache.has(pid)) {
            prefetchCache.add(pid);
            fetch('/api/pins/' + pid + '?prefetch=true', { method: 'GET' }).catch(function() {});
          }
          // B. [INVARIANT: SAFE-PREFETCH-EDGE-ONLY - ZERO NETWORK HOVER WAKEUPS]
          // Hover requests to /api/fleet/warm?pin_id= are permanently eradicated to protect sleeping shards
          if (!warmCache.has(pid)) {
            warmCache.add(pid);
          }
        }, 130);
      }
    }, { passive: true });

    document.addEventListener('mouseout', function(e) {
      if (e.target.closest('[data-pin-id], a[href*="/pin/"], a[href*="/pins/"]')) {
        if (hoverPrefetchTimer) { clearTimeout(hoverPrefetchTimer); hoverPrefetchTimer = null; }
      }
    }, { passive: true });
  })();
</script>`;
}
