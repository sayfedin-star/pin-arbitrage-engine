/**
 * src/ui/shared-formatters.mjs
 *
 * Single Source of Truth (SSOT) for Node-side UI Formatters, Sanitizers & Safe API Client.
 * Browser-side equivalents are served from the cached static `/pae-shell.js` bundle.
 *
 * Enforces:
 * - [INVARIANT: UNIVERSAL-STRICT-TIME-FORMATTING] (Rule 31: >=365d => years only e.g. '11.2y', <365d => days only e.g. '145d')
 * - [INVARIANT: ANTI-NAN-POISONING] (Rule 3: strict Number.isFinite() guards on all numeric formats)
 * - [INVARIANT: SAFE-UI-API-CLIENT] (15s AbortSignal.timeout, fresh signal per retry, 502/503/504 & AUTH_NOT_CONFIGURED handling)
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeCsvCell(val) {
  let str = String(val == null ? '' : val);
  const code = str.charCodeAt(0);
  if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
    str = "'" + str;
  }
  return '"' + str.replace(/"/g, '""') + '"';
}

export function formatNumber(val, options = {}) {
  if (val === null || val === undefined || val === '') return '0';

  if (typeof val === 'object' && val !== null) {
    val = val.saves ?? val.count ?? val.value ?? val.number ?? 0;
  }

  const num = typeof val === 'bigint' ? Number(val) : Number(val);
  if (!Number.isFinite(num)) return '0';

  if (options.compact) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    const decimals = options.decimals ?? 1;
    if (abs >= 1_000_000_000) {
      return sign + (abs / 1_000_000_000).toFixed(decimals).replace(/\.0+$/, '') + 'B';
    }
    if (abs >= 1_000_000) {
      return sign + (abs / 1_000_000).toFixed(decimals).replace(/\.0+$/, '') + 'M';
    }
    if (abs >= 1_000) {
      return sign + (abs / 1_000).toFixed(decimals).replace(/\.0+$/, '') + 'K';
    }
    return sign + Math.round(abs).toLocaleString('en-US');
  }

  return Math.round(num).toLocaleString('en-US');
}

export function formatUniversalAge(daysOrDate) {
  if (daysOrDate === null || daysOrDate === undefined || daysOrDate === '') return '—';

  let days = null;

  if (typeof daysOrDate === 'number') {
    days = daysOrDate;
  } else if (typeof daysOrDate === 'string' && /^-?\d+(\.\d+)?$/.test(daysOrDate.trim())) {
    days = Number(daysOrDate);
  } else {
    const t = new Date(daysOrDate).getTime();
    if (!Number.isNaN(t)) {
      days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    }
  }

  if (days === null || !Number.isFinite(days)) return '—';
  if (days < 0) days = 0;

  if (days >= 365) {
    const years = (days / 365).toFixed(1);
    return `${years}y`;
  }
  return `${Math.round(days)}d`;
}

export const formatAge = formatUniversalAge;

export function formatVelocity(vel, suffix = '/d') {
  if (vel === null || vel === undefined || vel === '') return `0${suffix}`;
  const num = Number(vel);
  if (!Number.isFinite(num)) return `0${suffix}`;
  if (num === 0) return `0${suffix}`;
  const formatted = Number.isInteger(num) ? num : num.toFixed(1);
  return (num > 0 ? `+${formatted}` : `${formatted}`) + suffix;
}

export function formatPercent(val, decimals = 1) {
  if (val === null || val === undefined || val === '') return '0%';
  const num = Number(val);
  if (!Number.isFinite(num)) return '0%';
  const formatted = num.toFixed(decimals).replace(/\.0+$/, '');
  return (num > 0 ? `+${formatted}%` : `${formatted}%`);
}

export function formatPinMethod(pinOrMethod) {
  let method = '';
  if (typeof pinOrMethod === 'string') {
    method = pinOrMethod;
  } else if (pinOrMethod && typeof pinOrMethod === 'object') {
    method = pinOrMethod.creation_method ||
             pinOrMethod.metadata?.creation_method ||
             pinOrMethod.metadata?.method ||
             (pinOrMethod.is_video ? 'video' : (pinOrMethod.is_product ? 'product' : 'standard'));
  }

  const m = String(method || '').toLowerCase().trim();
  if (m === 'carousel' || m.includes('carousel')) return 'Carousel';
  if (m === 'video' || m.includes('video')) return 'Video';
  if (m === 'idea' || m.includes('story') || m.includes('idea')) return 'Idea';
  if (m === 'product' || m.includes('shopping')) return 'Product';
  return 'Standard';
}

export function getPinMethodBadgeClass(pinOrMethod) {
  const method = formatPinMethod(pinOrMethod).toLowerCase();
  if (method === 'carousel') {
    return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
  }
  if (method === 'video') {
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
  }
  if (method === 'product') {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  }
  if (method === 'idea') {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  }
  return 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]';
}

export function formatDate(date) {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch (_) {
    return String(date).slice(0, 10);
  }
}

export function formatTimeframe(tf) {
  const t = String(tf || '').trim().toLowerCase();
  if (t === '24h') return '24 Hours';
  if (t === '5d') return '5 Days';
  if (t === '7d') return '7 Days';
  if (t === '15d') return '15 Days';
  return tf || '24h';
}

export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
    return trimmed;
  }
  return '#';
}

export function safeColor(color, fallback = '#cbd5e1') {
  if (!color || typeof color !== 'string') return fallback;
  const s = color.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(s)) return s;
  return fallback;
}

/**
 * Node/Universal safe fetch client helper (replaces deleted src/edge-shield-client.mjs)
 * Enforces AbortSignal.timeout(15000), fresh signal per retry, and 502/503/504 vs AUTH_NOT_CONFIGURED handling.
 */
export async function safeApiFetch(url, options = {}) {
  const timeoutMs = options.timeout || 15000;
  const maxRetries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : 0;
  const retryDelay = options.retryDelay || 1000;
  const callerSignal = options.signal;
  const fetchImpl = options.fetchImpl || fetch;
  const opts = { ...options };
  delete opts.timeout;
  delete opts.retries;
  delete opts.retryDelay;
  delete opts.fetchImpl;

  function createSignal() {
    let timeoutSig;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      timeoutSig = AbortSignal.timeout(timeoutMs);
    } else if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      setTimeout(() => {
        try { controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)); } catch (_) {}
      }, timeoutMs);
      timeoutSig = controller.signal;
    }
    if (callerSignal && timeoutSig && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      return AbortSignal.any([callerSignal, timeoutSig]);
    }
    return callerSignal || timeoutSig;
  }

  let rawRes;
  let parsedData = null;
  let rawText = '';
  let attempt = 0;

  while (true) {
    const attemptOpts = { ...opts };
    const sig = createSignal();
    if (sig) attemptOpts.signal = sig;
    parsedData = null;
    rawText = '';

    try {
      rawRes = await fetchImpl(url, attemptOpts);
    } catch (err) {
      if (callerSignal?.aborted) throw err;
      const isTimeout = err && (err.name === 'TimeoutError' || /timeout|aborted/i.test(String(err.message || '')));
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      if (isTimeout) {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (server or database cold-start). Please retry.`);
      }
      throw err;
    }

    const contentType = (rawRes.headers && typeof rawRes.headers.get === 'function' && rawRes.headers.get('content-type')) || '';
    if (contentType.includes('application/json')) {
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

    const isAuth503 = rawRes.status === 503 && (
      (parsedData && (parsedData.error === 'AUTH_NOT_CONFIGURED' || parsedData.code === 'AUTH_NOT_CONFIGURED')) ||
      (rawText && (rawText.includes('API_SECRET_KEY is not configured') || rawText.includes('AUTH_NOT_CONFIGURED')))
    );

    if (!rawRes.ok && !isAuth503 && (rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504) && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, retryDelay));
      continue;
    }
    break;
  }

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
        ? 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in server environment variables.'
        : (isColdStartOrGateway
          ? `Upstream database or gateway cold start (HTTP ${rawRes.status}). Please retry in a few seconds.`
          : rawText),
      raw_text: rawText,
      status: rawRes.status
    };
  } else if (!rawRes.ok) {
    if (isAuthNotConfigured) {
      parsedData.error = 'AUTH_NOT_CONFIGURED';
      parsedData.message = parsedData.message || 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in server environment variables.';
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
