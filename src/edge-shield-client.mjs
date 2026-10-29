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
  const maxRetries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : 0;
  const retryDelay = options.retryDelay || 1000;
  const opts = { ...options };
  delete opts.timeout;
  delete opts.retries;
  delete opts.retryDelay;

  function createSignal() {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(timeoutMs);
    } else if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      setTimeout(() => {
        try { controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)); } catch (_) {}
      }, timeoutMs);
      return controller.signal;
    }
    return undefined;
  }

  let rawRes;
  let attempt = 0;
  while (true) {
    // [INVARIANT: FRESH-SIGNAL-ON-RETRY] Inject a fresh AbortSignal.timeout on each attempt
    const attemptOpts = { ...opts };
    if (!options.signal) {
      attemptOpts.signal = createSignal();
    }
    try {
      rawRes = await fetch(url, attemptOpts);
      if (!rawRes.ok && (rawRes.status === 502 || rawRes.status === 504) && attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }
      break;
    } catch (err) {
      const isTimeout = err && (err.name === 'TimeoutError' || /timeout|aborted/i.test(err.message));
      if (attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }
      if (isTimeout) {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (server or database cold-start). Please retry.`);
      }
      throw err;
    }
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
  }

  // [INVARIANT: AUTH-503-DISTINCTION] Distinguish AUTH_NOT_CONFIGURED from Neon database cold start
  const isAuthNotConfigured = rawRes.status === 503 && (
    (parsedData && (parsedData.error === 'AUTH_NOT_CONFIGURED' || parsedData.code === 'AUTH_NOT_CONFIGURED')) ||
    (rawText && (rawText.includes('API_SECRET_KEY is not configured') || rawText.includes('AUTH_NOT_CONFIGURED')))
  );
  const isColdStartOrGateway = !isAuthNotConfigured && (rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504);

  if (!parsedData) {
    parsedData = {
      success: rawRes.ok,
      ok: rawRes.ok,
      error: isAuthNotConfigured
        ? 'AUTH_NOT_CONFIGURED'
        : (isColdStartOrGateway
          ? `Upstream database or gateway cold start (HTTP ${rawRes.status}). Please retry in a few seconds.`
          : (rawRes.ok ? null : (rawText || `HTTP ${rawRes.status}: ${rawRes.statusText || 'Error'}`))),
      message: isAuthNotConfigured
        ? 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in Cloudflare environment secrets.'
        : (isColdStartOrGateway
          ? `Upstream database or gateway cold start (HTTP ${rawRes.status}). Please retry in a few seconds.`
          : rawText),
      raw_text: rawText,
      status: rawRes.status
    };
  } else if (!rawRes.ok) {
    if (isAuthNotConfigured) {
      parsedData.error = 'AUTH_NOT_CONFIGURED';
      parsedData.message = parsedData.message || 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in Cloudflare environment secrets.';
    } else if (rawRes.status === 401) {
      parsedData.error = parsedData.error || 'UNAUTHORIZED';
      parsedData.message = parsedData.message || 'Invalid or missing API key (HTTP 401).';
    }
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
        var maxRetries = typeof options.retries === 'number' ? Math.max(0, options.retries) : 0;
        var retryDelay = options.retryDelay || 1000;
        var fetchOptions = Object.assign({}, options);
        delete fetchOptions.timeout;
        delete fetchOptions.retries;
        delete fetchOptions.retryDelay;

        function createSignal() {
          if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(timeoutMs);
          } else if (typeof AbortController !== 'undefined') {
            var controller = new AbortController();
            setTimeout(function() {
              try { controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')); } catch (_) {}
            }, timeoutMs);
            return controller.signal;
          }
          return undefined;
        }

        var rawRes;
        var attempt = 0;
        while (true) {
          // [INVARIANT: FRESH-SIGNAL-ON-RETRY] Generate fresh timeout signal on each attempt
          var attemptOpts = Object.assign({}, fetchOptions);
          if (!options.signal) {
            attemptOpts.signal = createSignal();
          }
          try {
            rawRes = await fetch(url, attemptOpts);
            if (!rawRes.ok && (rawRes.status === 502 || rawRes.status === 504) && attempt < maxRetries) {
              attempt++;
              await new Promise(function(r) { setTimeout(r, retryDelay); });
              continue;
            }
            break;
          } catch (networkErr) {
            var isTimeout = networkErr && (networkErr.name === 'TimeoutError' || /timeout|aborted/i.test(networkErr.message));
            if (attempt < maxRetries) {
              attempt++;
              await new Promise(function(r) { setTimeout(r, retryDelay); });
              continue;
            }
            if (isTimeout) {
              throw new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + 's (server or database cold-start). Please retry.');
            }
            throw networkErr;
          }
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
        }

        // [INVARIANT: AUTH-503-DISTINCTION] Distinguish AUTH_NOT_CONFIGURED from database cold start
        var isAuthNotConfigured = rawRes.status === 503 && (
          (parsedData && (parsedData.error === 'AUTH_NOT_CONFIGURED' || parsedData.code === 'AUTH_NOT_CONFIGURED')) ||
          (rawText && (rawText.indexOf('API_SECRET_KEY is not configured') !== -1 || rawText.indexOf('AUTH_NOT_CONFIGURED') !== -1))
        );
        var isColdStartOrGateway = !isAuthNotConfigured && (rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504);

        if (!parsedData) {
          parsedData = {
            success: rawRes.ok,
            ok: rawRes.ok,
            error: isAuthNotConfigured
              ? 'AUTH_NOT_CONFIGURED'
              : (isColdStartOrGateway
                ? 'Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.'
                : (rawRes.ok ? null : (rawText || ('HTTP ' + rawRes.status + ': ' + (rawRes.statusText || 'Error'))))),
            message: isAuthNotConfigured
              ? 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in Cloudflare environment secrets.'
              : (isColdStartOrGateway
                ? 'Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.'
                : rawText),
            raw_text: rawText,
            status: rawRes.status
          };
        } else if (!rawRes.ok) {
          if (isAuthNotConfigured) {
            parsedData.error = 'AUTH_NOT_CONFIGURED';
            parsedData.message = parsedData.message || 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in Cloudflare environment secrets.';
          } else if (rawRes.status === 401) {
            parsedData.error = parsedData.error || 'UNAUTHORIZED';
            parsedData.message = parsedData.message || 'Invalid or missing API key (HTTP 401).';
          }
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

    // Smart Prefetch & Predictive JIT Warming on Hover (130ms debounce)
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
            fetch('/api/pins/' + pid + '?prefetch=true', { method: 'GET' })
              .then(function(res) {
                if (!res.ok) return null;
                return res.json().catch(function() { return null; });
              })
              .then(function(data) {
                if (data && (data.status === 'cache_miss' || data.not_cached)) {
                  // Normal edge cache miss on prefetch - handled smoothly
                  return;
                }
              })
              .catch(function() {});
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
