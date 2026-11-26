/**
 * Pin Arbitrage Engine — Unified Browser Runtime (/pae-shell.js)
 *
 * Consolidates shared browser primitives across all 7 SSR studios:
 * 1. API Key Request Interceptor (pae_admin_api_key)
 * 2. Safe UI API Client: window.safeApiFetch & window.apiFetch (15s AbortSignal.timeout,
 *    fresh signal per retry, 502/503/504 cold-start vs AUTH_NOT_CONFIGURED handling)
 * 3. Shared Formatters & Sanitizers: window.PAE & window.PAEFormatters
 *    (safeUrl, safeColor, sanitizeCsvCell, formatUniversalAge, formatNumber, escapeHtml, etc.)
 * 4. Pin Image Resolution & Fallback Ladder (resolvePinImageUrl, handlePinImgError)
 * 5. Non-Blocking Bento Toast & Accessible Confirmation Dialog (window.PAE.toast, window.PAE.confirm)
 */
(function initPaeShell(globalScope) {
  'use strict';

  var win = typeof globalScope !== 'undefined' ? globalScope : (typeof window !== 'undefined' ? window : null);
  if (!win) return;

  // 1. Auth Header Interceptor for Admin API Key (localStorage 'pae_admin_api_key')
  if (!win.__paeAuthInterceptorInstalled && typeof win.fetch === 'function') {
    win.__paeAuthInterceptorInstalled = true;
    var origFetch = win.fetch.bind(win);
    win.fetch = async function paeAuthFetch(input, init) {
      var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      var isSameOriginApiCall = false;
      if (urlStr) {
        var trimmedUrl = String(urlStr).trim();
        if (trimmedUrl.indexOf('/api/') === 0 && trimmedUrl.indexOf('//') !== 0) {
          isSameOriginApiCall = true;
        } else if (
          typeof URL === 'function' &&
          typeof win.location === 'object' &&
          win.location &&
          win.location.origin &&
          win.location.origin !== 'null'
        ) {
          try {
            var parsedUrl = new URL(trimmedUrl, win.location.origin);
            if (parsedUrl.origin === win.location.origin && parsedUrl.pathname.indexOf('/api/') === 0) {
              isSameOriginApiCall = true;
            }
          } catch (_) {
            isSameOriginApiCall = false;
          }
        }
      }
      var savedKey = '';
      try {
        savedKey = typeof localStorage !== 'undefined' ? (localStorage.getItem('pae_admin_api_key') || '') : '';
      } catch (_) {}
      if (isSameOriginApiCall && savedKey) {
        init = Object.assign({}, init);
        var headers = new Headers(init.headers || (typeof input === 'object' && input && input.headers ? input.headers : undefined));
        if (!headers.has('x-api-key') && !headers.has('Authorization')) {
          headers.set('x-api-key', savedKey);
        }
        init.headers = headers;
      }
      return origFetch(input, init);
    };
  }

  // 2. Shared Formatters & Sanitizers
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    var trimmed = url.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (/^https?:\/\//i.test(trimmed) || (trimmed.indexOf('/') === 0 && trimmed.indexOf('//') !== 0 && trimmed.indexOf('/\\') !== 0)) {
      return trimmed;
    }
    return '#';
  }

  function safeColor(color, fallback) {
    var fb = fallback || '#cbd5e1';
    if (!color || typeof color !== 'string') return fb;
    var s = color.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
    if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(s)) return s;
    return fb;
  }

  function sanitizeCsvCell(val) {
    var str = String(val == null ? '' : val);
    var code = str.charCodeAt(0);
    if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
      str = "'" + str;
    }
    return '"' + str.replace(/"/g, '""') + '"';
  }

  function formatNumber(val, options) {
    if (val === null || val === undefined || val === '') return '0';
    if (typeof val === 'object' && val !== null) {
      val = val.saves != null ? val.saves : (val.count != null ? val.count : (val.value != null ? val.value : (val.number != null ? val.number : 0)));
    }
    var num = Number(val);
    if (!Number.isFinite(num)) return '0';
    if (options && options.compact) {
      var abs = Math.abs(num);
      var sign = num < 0 ? '-' : '';
      var dec = options.decimals !== undefined ? options.decimals : 1;
      if (abs >= 1000000000) return sign + (abs / 1000000000).toFixed(dec).replace(/\.0+$/, '') + 'B';
      if (abs >= 1000000) return sign + (abs / 1000000).toFixed(dec).replace(/\.0+$/, '') + 'M';
      if (abs >= 1000) return sign + (abs / 1000).toFixed(dec).replace(/\.0+$/, '') + 'K';
      return sign + Math.round(abs).toLocaleString('en-US');
    }
    return Math.round(num).toLocaleString('en-US');
  }

  function formatUniversalAge(daysOrDate) {
    if (daysOrDate === null || daysOrDate === undefined || daysOrDate === '') return '—';
    var days = null;
    if (typeof daysOrDate === 'number') {
      days = daysOrDate;
    } else if (typeof daysOrDate === 'string' && /^-?\d+(\.\d+)?$/.test(daysOrDate.trim())) {
      days = Number(daysOrDate);
    } else {
      var t = new Date(daysOrDate).getTime();
      if (!Number.isNaN(t)) {
        days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
      }
    }
    if (days === null || !Number.isFinite(days)) return '—';
    if (days < 0) days = 0;
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }

  function formatVelocity(vel, suffix) {
    var sfx = suffix || '/d';
    if (vel === null || vel === undefined || vel === '') return '0' + sfx;
    var num = Number(vel);
    if (!Number.isFinite(num) || num === 0) return '0' + sfx;
    var fmt = Number.isInteger(num) ? num : num.toFixed(1);
    return (num > 0 ? ('+' + fmt) : String(fmt)) + sfx;
  }

  function formatPercent(val, decimals) {
    var dec = decimals !== undefined ? decimals : 1;
    if (val === null || val === undefined || val === '') return '0%';
    var num = Number(val);
    if (!Number.isFinite(num)) return '0%';
    var fmt = num.toFixed(dec).replace(/\.0+$/, '');
    return num > 0 ? ('+' + fmt + '%') : (fmt + '%');
  }

  function formatPinMethod(pinOrMethod) {
    var m = '';
    if (typeof pinOrMethod === 'string') {
      m = pinOrMethod;
    } else if (pinOrMethod && typeof pinOrMethod === 'object') {
      m = pinOrMethod.creation_method ||
        (pinOrMethod.metadata && (pinOrMethod.metadata.creation_method || pinOrMethod.metadata.method)) ||
        (pinOrMethod.is_video ? 'video' : (pinOrMethod.is_product ? 'product' : 'standard'));
    }
    m = String(m || '').toLowerCase().trim();
    if (m.indexOf('carousel') !== -1) return 'Carousel';
    if (m.indexOf('video') !== -1) return 'Video';
    if (m.indexOf('idea') !== -1 || m.indexOf('story') !== -1) return 'Idea';
    if (m.indexOf('product') !== -1 || m.indexOf('shopping') !== -1) return 'Product';
    return 'Standard';
  }

  function getPinMethodBadgeClass(pinOrMethod) {
    var m = formatPinMethod(pinOrMethod).toLowerCase();
    if (m === 'carousel') return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
    if (m === 'video') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    if (m === 'product') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    if (m === 'idea') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    return 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]';
  }

  function formatTimeframe(tf) {
    var t = String(tf || '').trim().toLowerCase();
    if (t === '24h') return '24 Hours';
    if (t === '5d') return '5 Days';
    if (t === '7d') return '7 Days';
    if (t === '15d') return '15 Days';
    return tf || '24h';
  }

  function formatDate(date) {
    if (!date) return '—';
    try {
      var d = new Date(date);
      if (Number.isNaN(d.getTime())) return String(date).slice(0, 10);
      return d.toISOString().slice(0, 10);
    } catch (_) {
      return String(date).slice(0, 10);
    }
  }

  // 3. Safe UI API Client (15s timeout, fresh signal per retry, 502/503/504 & AUTH_NOT_CONFIGURED handling)
  async function safeApiFetch(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    var timeoutMs = opts.timeout || 15000;
    var maxRetries = typeof opts.retries === 'number' && Number.isFinite(opts.retries) ? Math.max(0, Math.floor(opts.retries)) : 0;
    var retryDelay = opts.retryDelay || 1000;
    var callerSignal = opts.signal;
    delete opts.timeout;
    delete opts.retries;
    delete opts.retryDelay;

    function createAttemptSignal() {
      var timeoutSig;
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        timeoutSig = AbortSignal.timeout(timeoutMs);
      } else if (typeof AbortController !== 'undefined') {
        var controller = new AbortController();
        setTimeout(function() {
          try { controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')); } catch (_) {}
        }, timeoutMs);
        timeoutSig = controller.signal;
      }
      if (callerSignal && timeoutSig && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any([callerSignal, timeoutSig]);
      }
      return callerSignal || timeoutSig;
    }

    var rawRes;
    var parsedData = null;
    var rawText = '';
    var isJson = false;
    var attempt = 0;

    while (true) {
      var attemptOpts = Object.assign({}, opts);
      var sig = createAttemptSignal();
      if (sig) attemptOpts.signal = sig;
      parsedData = null;
      rawText = '';
      isJson = false;

      try {
        rawRes = await win.fetch(url, attemptOpts);
      } catch (networkErr) {
        if (callerSignal && callerSignal.aborted) {
          throw networkErr;
        }
        var isTimeout = Boolean(networkErr && (networkErr.name === 'TimeoutError' || /timeout|aborted/i.test(String(networkErr.message || ''))));
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

      var contentType = (rawRes.headers && typeof rawRes.headers.get === 'function' && rawRes.headers.get('content-type')) || '';
      isJson = contentType.indexOf('application/json') !== -1;

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

      var isAuth503 = rawRes.status === 503 && (
        (parsedData && (parsedData.error === 'AUTH_NOT_CONFIGURED' || parsedData.code === 'AUTH_NOT_CONFIGURED')) ||
        (rawText && (rawText.indexOf('API_SECRET_KEY is not configured') !== -1 || rawText.indexOf('AUTH_NOT_CONFIGURED') !== -1))
      );

      if (!rawRes.ok && !isAuth503 && (rawRes.status === 502 || rawRes.status === 503 || rawRes.status === 504) && attempt < maxRetries) {
        attempt++;
        await new Promise(function(r) { setTimeout(r, retryDelay); });
        continue;
      }
      break;
    }

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
            ? ('Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.')
            : (rawRes.ok ? null : (rawText || ('HTTP ' + rawRes.status + ': ' + (rawRes.statusText || 'Error'))))),
        message: isAuthNotConfigured
          ? 'API_SECRET_KEY is not configured on server (HTTP 503). Please set API_SECRET_KEY in server environment variables.'
          : (isColdStartOrGateway
            ? ('Upstream database or gateway cold start (HTTP ' + rawRes.status + '). Please retry in a few seconds.')
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
      json: async function() { return parsedData; },
      text: async function() { return rawText || (typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)); },
      clone: function() { return typeof rawRes.clone === 'function' ? rawRes.clone() : this; }
    };
  }

  // 4. Pin Image Resolution & Fallback Ladder
  var SVG_PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2371717a%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>';

  function resolvePinImageUrl(url, tier) {
    var targetTier = tier || '236x';
    if (!url || typeof url !== 'string') return SVG_PLACEHOLDER;
    if (url.indexOf('pinimg.com') === -1) return url;
    return url.replace(/\/(236x|474x|564x|736x|1200x|originals)\//, '/' + targetTier + '/');
  }

  function resolveHdImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/\/(236x|474x|564x|736x)\//, '/1200x/');
  }

  function resolveLosslessImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/\/(236x|474x|564x|736x|1200x)\//, '/originals/');
  }

  function handlePinImgError(img) {
    if (!img) return;
    var currentSrc = img.src || '';
    img._errStep = (img._errStep || 0) + 1;
    if (img._errStep > 4 || currentSrc.indexOf('pinimg.com') === -1) {
      img.onerror = null;
      img.src = SVG_PLACEHOLDER;
      return;
    }
    if (currentSrc.indexOf('/236x/') !== -1) {
      img.src = currentSrc.replace('/236x/', '/474x/');
    } else if (currentSrc.indexOf('/474x/') !== -1) {
      img.src = currentSrc.replace('/474x/', '/736x/');
    } else if (currentSrc.indexOf('/736x/') !== -1) {
      img.src = currentSrc.replace('/736x/', '/originals/');
    } else {
      img.onerror = null;
      img.src = SVG_PLACEHOLDER;
    }
  }

  // 5. Non-Blocking Toast Helper
  function showPaeToast(message, type) {
    if (typeof document === 'undefined' || !document.body) return;
    var kind = type || 'info';
    var root = document.getElementById('pae-shell-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pae-shell-toast-root';
      root.setAttribute('role', 'region');
      root.setAttribute('aria-label', 'Notifications');
      root.setAttribute('aria-live', 'polite');
      root.className = 'fixed bottom-5 right-5 z-[90] flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(root);
    }

    var item = document.createElement('div');
    var toneClass = kind === 'error'
      ? 'bg-rose-50 dark:bg-rose-950/95 border-rose-500/40 text-rose-900 dark:text-rose-200'
      : (kind === 'success'
        ? 'bg-emerald-50 dark:bg-emerald-950/95 border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
        : (kind === 'warning'
          ? 'bg-amber-50 dark:bg-amber-950/95 border-amber-500/40 text-amber-900 dark:text-amber-200'
          : 'bg-white dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-slate-100'));
    item.setAttribute('role', 'status');
    item.className = 'pointer-events-auto px-4 py-3 rounded-xl border text-xs font-medium shadow-2xl flex items-center justify-between gap-3 transition-opacity duration-200 ' + toneClass;

    var textSpan = document.createElement('span');
    textSpan.textContent = String(message || '');
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.className = 'text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs cursor-pointer';
    closeBtn.textContent = '✕';
    closeBtn.onclick = function() {
      if (item.parentNode) item.parentNode.removeChild(item);
    };

    item.appendChild(textSpan);
    item.appendChild(closeBtn);
    root.appendChild(item);

    setTimeout(function() {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 3500);
  }

  // 6. Non-Blocking Accessible Confirmation Dialog (iframe-safe, Light-Mode Bento)
  var confirmDialogCounter = 0;

  function confirmPaeAction(message, options) {
    var opts = options || {};
    if (typeof document === 'undefined' || !document.body) {
      return Promise.resolve(false);
    }
    return new Promise(function(resolve) {
      var dialogUid = 'pae-confirm-' + (++confirmDialogCounter);
      var prevActive = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[95] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4';

      var dialog = document.createElement('div');
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', dialogUid + '-title');
      dialog.setAttribute('aria-describedby', dialogUid + '-body');
      dialog.className = 'w-full max-w-md rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4';

      var titleEl = document.createElement('h3');
      titleEl.id = dialogUid + '-title';
      titleEl.className = 'text-sm font-bold text-slate-900 dark:text-[#FAFAFA]';
      titleEl.textContent = opts.title || 'Confirm Action';

      var bodyEl = document.createElement('p');
      bodyEl.id = dialogUid + '-body';
      bodyEl.className = 'text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed';
      bodyEl.textContent = String(message || 'Are you sure you want to continue?');

      var btnRow = document.createElement('div');
      btnRow.className = 'flex items-center justify-end gap-2 pt-2';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] hover:bg-slate-100 dark:hover:bg-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';

      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      var isDanger = opts.danger !== false;
      confirmBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ' +
        (isDanger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-900 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-500');
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';

      var settled = false;
      function cleanup(result) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeyDown);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (prevActive && typeof prevActive.focus === 'function') {
          try { prevActive.focus(); } catch (_) {}
        }
        resolve(result);
      }

      function onKeyDown(ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          cleanup(false);
        } else if (ev.key === 'Tab') {
          if (ev.shiftKey && document.activeElement === cancelBtn) {
            ev.preventDefault();
            try { confirmBtn.focus(); } catch (_) {}
          } else if (!ev.shiftKey && document.activeElement === confirmBtn) {
            ev.preventDefault();
            try { cancelBtn.focus(); } catch (_) {}
          }
        }
      }

      overlay.addEventListener('click', function(ev) {
        if (ev.target === overlay) cleanup(false);
      });
      cancelBtn.addEventListener('click', function() { cleanup(false); });
      confirmBtn.addEventListener('click', function() { cleanup(true); });
      document.addEventListener('keydown', onKeyDown);

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);
      dialog.appendChild(titleEl);
      dialog.appendChild(bodyEl);
      dialog.appendChild(btnRow);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      try { confirmBtn.focus(); } catch (_) {}
    });
  }

  // 6B. Shared Shell Utilities (copyText, downloadCsv, toggleTheme, toggleSidebar)
  async function copyTextAction(text, options) {
    var opts = options || {};
    var str = String(text == null ? '' : text);
    var copied = false;
    try {
      if (win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function') {
        await win.navigator.clipboard.writeText(str);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }

    if (!copied && typeof document !== 'undefined' && document.body && typeof document.createElement === 'function') {
      try {
        var ta = document.createElement('textarea');
        ta.value = str;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        if (typeof ta.select === 'function') ta.select();
        if (typeof document.execCommand === 'function') {
          copied = Boolean(document.execCommand('copy'));
        }
        if (ta.parentNode) ta.parentNode.removeChild(ta);
      } catch (_) {
        copied = false;
      }
    }

    if (opts.toast) {
      if (copied) {
        showPaeToast(opts.successMessage || 'Copied to clipboard', 'success');
      } else {
        showPaeToast(opts.errorMessage || 'Failed to copy to clipboard', 'error');
      }
    }
    return copied;
  }

  function downloadCsvAction(filename, rows, options) {
    var opts = options || {};
    var rawName = String(filename || 'export.csv').trim() || 'export.csv';
    var safeName = rawName.toLowerCase().endsWith('.csv') ? rawName : (rawName + '.csv');
    var list = Array.isArray(rows) ? rows : [];
    var csvLines = [];

    if (Array.isArray(opts.headers) && opts.headers.length > 0) {
      csvLines.push(opts.headers.map(function(h) { return sanitizeCsvCell(h); }).join(','));
    }

    if (list.length > 0 && !Array.isArray(list[0]) && typeof list[0] === 'object' && list[0] !== null) {
      var cols = Array.isArray(opts.columns) && opts.columns.length > 0 ? opts.columns : Object.keys(list[0]);
      if (csvLines.length === 0 && opts.includeHeaders !== false) {
        csvLines.push(cols.map(function(c) { return sanitizeCsvCell(c); }).join(','));
      }
      for (var rIdx = 0; rIdx < list.length; rIdx++) {
        var rowObj = list[rIdx] || {};
        var cells = cols.map(function(col) { return sanitizeCsvCell(rowObj[col]); });
        csvLines.push(cells.join(','));
      }
    } else {
      for (var i = 0; i < list.length; i++) {
        var rowArr = Array.isArray(list[i]) ? list[i] : [list[i]];
        csvLines.push(rowArr.map(function(cell) { return sanitizeCsvCell(cell); }).join(','));
      }
    }

    var csvText = csvLines.join('\n');
    if (
      typeof document !== 'undefined' &&
      document.body &&
      typeof Blob === 'function' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      var blobUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.setAttribute('href', blobUrl);
      link.setAttribute('download', safeName);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(blobUrl);
    }
    return csvText;
  }

  function toggleThemeAction(forceDark) {
    var currentDark = false;
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      currentDark = document.documentElement.classList.contains('dark');
    } else {
      try {
        currentDark = typeof localStorage !== 'undefined'
          ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark'
          : false;
      } catch (_) {
        currentDark = false;
      }
    }

    var nextDark = typeof forceDark === 'boolean' ? forceDark : !currentDark;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pa_theme', nextDark ? 'dark' : 'light');
        localStorage.setItem('pin_theme', nextDark ? 'dark' : 'light');
      }
    } catch (_) {}

    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    }

    if (typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try {
        win.dispatchEvent(new CustomEvent('pae:theme-changed', { detail: { isDark: nextDark } }));
      } catch (_) {}
    }
    return nextDark;
  }

  function toggleSidebarAction(forceCollapsed) {
    var currentCollapsed = false;
    try {
      currentCollapsed = typeof localStorage !== 'undefined'
        ? localStorage.getItem('pae_sidebar_collapsed') === 'true'
        : false;
    } catch (_) {
      currentCollapsed = false;
    }

    var nextCollapsed = typeof forceCollapsed === 'boolean' ? forceCollapsed : !currentCollapsed;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pae_sidebar_collapsed', nextCollapsed ? 'true' : 'false');
      }
    } catch (_) {}

    if (typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try {
        win.dispatchEvent(new CustomEvent('pae:sidebar-changed', { detail: { collapsed: nextCollapsed } }));
      } catch (_) {}
    }
    return nextCollapsed;
  }

  async function confirmDeleteFolderAction(folderId, executeFn) {
    var cleanId = String(folderId || '').trim();
    if (!cleanId) return false;
    var confirmed = await confirmPaeAction(
      'Delete this campaign folder? Tracked keywords and pin history will remain intact.',
      { title: 'Delete Campaign Folder', confirmLabel: 'Delete Folder', cancelLabel: 'Keep Folder', danger: true }
    );
    if (!confirmed) return false;
    if (typeof executeFn === 'function') {
      return executeFn(cleanId);
    }
    try {
      var res = await safeApiFetch('/api/folders/' + encodeURIComponent(cleanId), { method: 'DELETE' });
      if (!res.ok) {
        var msg = (res.data && (res.data.message || res.data.error)) || ('HTTP ' + res.status);
        showPaeToast('Failed to delete folder: ' + msg, 'error');
        return false;
      }
      showPaeToast('Campaign folder deleted.', 'success');
      if (win.location) win.location.href = '/folders';
      return true;
    } catch (err) {
      showPaeToast('Network error deleting folder: ' + (err && err.message ? err.message : 'Unknown error'), 'error');
      return false;
    }
  }

  // 7. Export Globals (window.PAE, window.PAEFormatters, window.safeApiFetch, window.apiFetch)
  var sharedFormatters = {
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    safeColor: safeColor,
    sanitizeCsvCell: sanitizeCsvCell,
    formatNumber: formatNumber,
    formatUniversalAge: formatUniversalAge,
    formatAge: formatUniversalAge,
    formatVelocity: formatVelocity,
    formatPercent: formatPercent,
    formatPinMethod: formatPinMethod,
    getPinMethodBadgeClass: getPinMethodBadgeClass,
    formatTimeframe: formatTimeframe,
    formatDate: formatDate
  };

  win.PAEFormatters = Object.assign({}, win.PAEFormatters || {}, sharedFormatters);
  win.PAE = Object.assign({}, win.PAE || {}, sharedFormatters, {
    apiFetch: safeApiFetch,
    safeApiFetch: safeApiFetch,
    resolvePinImageUrl: resolvePinImageUrl,
    resolveHdImageUrl: resolveHdImageUrl,
    resolveLosslessImageUrl: resolveLosslessImageUrl,
    handlePinImgError: handlePinImgError,
    toast: showPaeToast,
    confirm: confirmPaeAction,
    confirmDeleteFolder: confirmDeleteFolderAction,
    copyText: copyTextAction,
    downloadCsv: downloadCsvAction,
    toggleTheme: toggleThemeAction,
    toggleSidebar: toggleSidebarAction
  });

  if (!win.safeApiFetch) win.safeApiFetch = safeApiFetch;
  if (!win.apiFetch) win.apiFetch = safeApiFetch;
  if (!win.paeToast) win.paeToast = showPaeToast;
  if (!win.paeConfirm) win.paeConfirm = confirmPaeAction;
  if (!win.paeCopyText) win.paeCopyText = copyTextAction;
  if (!win.paeDownloadCsv) win.paeDownloadCsv = downloadCsvAction;
  if (!win.resolvePinImageUrl) win.resolvePinImageUrl = resolvePinImageUrl;
  if (!win.resolveHdImageUrl) win.resolveHdImageUrl = resolveHdImageUrl;
  if (!win.resolveLosslessImageUrl) win.resolveLosslessImageUrl = resolveLosslessImageUrl;
  if (!win.handlePinImgError) win.handlePinImgError = handlePinImgError;
  if (!win.escapeHtml) win.escapeHtml = escapeHtml;
  if (!win.safeUrl) win.safeUrl = safeUrl;
  if (!win.safeColor) win.safeColor = safeColor;
  if (!win.sanitizeCsvCell) win.sanitizeCsvCell = sanitizeCsvCell;
  if (!win.formatNumber) win.formatNumber = formatNumber;
  if (!win.formatUniversalAge) win.formatUniversalAge = formatUniversalAge;
  if (!win.formatAge) win.formatAge = formatUniversalAge;
  if (!win.formatVelocity) win.formatVelocity = formatVelocity;
  if (!win.formatPercent) win.formatPercent = formatPercent;
  if (!win.formatPinMethod) win.formatPinMethod = formatPinMethod;
  if (!win.getPinMethodBadgeClass) win.getPinMethodBadgeClass = getPinMethodBadgeClass;
  if (!win.formatTimeframe) win.formatTimeframe = formatTimeframe;
  if (!win.formatDate) win.formatDate = formatDate;

  win.__edgeShieldInstalled = true;
  win.__paeShellInstalled = true;

  // 8. x-cloak Failsafe (ensures body becomes visible even if CDN Alpine.js is delayed)
  setTimeout(function() {
    if (typeof document !== 'undefined' && document.body && document.body.hasAttribute('x-cloak')) {
      document.body.removeAttribute('x-cloak');
    }
  }, 1200);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
