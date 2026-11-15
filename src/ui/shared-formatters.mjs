/**
 * src/ui/shared-formatters.mjs
 * 
 * Single Source of Truth (SSOT) for UI Numeric, Date, and Metric Formatters
 * Enforces:
 * - [INVARIANT: UNIVERSAL-STRICT-TIME-FORMATTING] (Rule 31: >=365d => years only e.g. '11.2y', <365d => days only e.g. '145d')
 * - [INVARIANT: ANTI-NAN-POISONING] (Rule 3: strict Number.isFinite() guards on all numeric formats)
 * - [INVARIANT: DESIGN-TOKEN-PARITY] (Geist / JetBrains Mono tabular-nums)
 * - [INVARIANT: HEADLESS-NODE-SHIELD] (Rule 17: browser globals safely guarded)
 */

/**
 * Format a number with comma separators or compact notation
 * @param {number|string|bigint|null|undefined} val
 * @param {object} [options]
 * @param {boolean} [options.compact=false] - If true, formats e.g. 1.2M, 45.3K
 * @param {number} [options.decimals=1] - Decimal precision for compact mode
 * @returns {string}
 */
export function formatNumber(val, options = {}) {
  if (val === null || val === undefined || val === '') return '0';
  
  // Unpack object if passed accidentally (Anti-Object Poisoning Rule 3)
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

/**
 * Format age strictly complying with Rule 31:
 * - If duration/age is >= 365 days: display strictly in years only (e.g. '11.2y', '2.1y' - NEVER show days in parentheses)
 * - If duration/age is < 365 days: display strictly in days only (e.g. '145d')
 * @param {number|string|Date|null|undefined} daysOrDate - Number of days or ISO date string
 * @returns {string}
 */
export function formatUniversalAge(daysOrDate) {
  if (daysOrDate === null || daysOrDate === undefined || daysOrDate === '') return '—';

  let days = null;

  if (typeof daysOrDate === 'number') {
    days = daysOrDate;
  } else if (typeof daysOrDate === 'string' && /^-?\d+(\.\d+)?$/.test(daysOrDate.trim())) {
    days = Number(daysOrDate);
  } else {
    // Treat as date string
    const t = new Date(daysOrDate).getTime();
    if (!Number.isNaN(t)) {
      days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    }
  }

  if (days === null || !Number.isFinite(days)) return '—';
  if (days < 0) days = 0;

  // [INVARIANT: UNIVERSAL-STRICT-TIME-FORMATTING] Rule 31 Parity
  if (days >= 365) {
    const years = (days / 365).toFixed(1);
    return `${years}y`;
  }
  return `${Math.round(days)}d`;
}

/**
 * Alias for formatUniversalAge
 */
export const formatAge = formatUniversalAge;

/**
 * Format daily velocity with explicit + sign and tabular-nums
 * @param {number|string|null|undefined} vel
 * @param {string} [suffix='/d']
 * @returns {string}
 */
export function formatVelocity(vel, suffix = '/d') {
  if (vel === null || vel === undefined || vel === '') return `0${suffix}`;
  const num = Number(vel);
  if (!Number.isFinite(num)) return `0${suffix}`;
  if (num === 0) return `0${suffix}`;
  const formatted = Number.isInteger(num) ? num : num.toFixed(1);
  return (num > 0 ? `+${formatted}` : `${formatted}`) + suffix;
}

/**
 * Format percentage delta
 * @param {number|string|null|undefined} val
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercent(val, decimals = 1) {
  if (val === null || val === undefined || val === '') return '0%';
  const num = Number(val);
  if (!Number.isFinite(num)) return '0%';
  const formatted = num.toFixed(decimals).replace(/\.0+$/, '');
  return (num > 0 ? `+${formatted}%` : `${formatted}%`);
}

/**
 * Format pin creation method label
 * @param {object|string|null|undefined} pinOrMethod
 * @returns {string}
 */
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

/**
 * Get CSS badge classes for pin method badge
 * @param {object|string|null|undefined} pinOrMethod
 * @returns {string}
 */
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

/**
 * Format Date to standard YYYY-MM-DD
 * @param {Date|string|number|null|undefined} date
 * @returns {string}
 */
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

/**
 * Format Timeframe code to human-readable label
 * @param {string|null|undefined} tf
 * @returns {string}
 */
export function formatTimeframe(tf) {
  const t = String(tf || '').trim().toLowerCase();
  if (t === '24h') return '24 Hours';
  if (t === '5d') return '5 Days';
  if (t === '7d') return '7 Days';
  if (t === '15d') return '15 Days';
  return tf || '24h';
}

/**
 * Safe URL sanitizer (prevents javascript: protocols)
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (trimmed.toLowerCase().startsWith('javascript:') || trimmed.toLowerCase().startsWith('data:text/html')) {
    return '#';
  }
  return trimmed;
}

/**
 * Safe CSS color sanitizer (prevents CSS/attribute injection via color strings)
 * @param {string|null|undefined} color
 * @param {string} [fallback='#cbd5e1']
 * @returns {string}
 */
export function safeColor(color, fallback = '#cbd5e1') {
  if (!color || typeof color !== 'string') return fallback;
  const s = color.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(s)) return s;
  return fallback;
}

/**
 * Get client-side inline script initializing window.PAEFormatters
 * Safe for injection into SSR HTML templates.
 * @returns {string}
 */
export function getInlineFormattersScript() {
  return `
  <script>
    (function() {
      if (typeof window === 'undefined') return;
      if (window.PAEFormatters) return;

      var formatNumber = function(val, options) {
        if (val === null || val === undefined || val === '') return '0';
        if (typeof val === 'object' && val !== null) {
          val = val.saves || val.count || val.value || val.number || 0;
        }
        var num = Number(val);
        if (!Number.isFinite(num)) return '0';
        if (options && options.compact) {
          var abs = Math.abs(num);
          var sign = num < 0 ? '-' : '';
          var dec = options.decimals !== undefined ? options.decimals : 1;
          if (abs >= 1000000000) return sign + (abs / 1000000000).toFixed(dec).replace(/\\.0+$/, '') + 'B';
          if (abs >= 1000000) return sign + (abs / 1000000).toFixed(dec).replace(/\\.0+$/, '') + 'M';
          if (abs >= 1000) return sign + (abs / 1000).toFixed(dec).replace(/\\.0+$/, '') + 'K';
          return sign + Math.round(abs).toLocaleString('en-US');
        }
        return Math.round(num).toLocaleString('en-US');
      };

      var formatUniversalAge = function(daysOrDate) {
        if (daysOrDate === null || daysOrDate === undefined || daysOrDate === '') return '—';
        var days = null;
        if (typeof daysOrDate === 'number') {
          days = daysOrDate;
        } else if (typeof daysOrDate === 'string' && /^-?\\d+(\\.\\d+)?$/.test(daysOrDate.trim())) {
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
      };

      var formatVelocity = function(vel, suffix) {
        suffix = suffix || '/d';
        if (vel === null || vel === undefined || vel === '') return '0' + suffix;
        var num = Number(vel);
        if (!Number.isFinite(num) || num === 0) return '0' + suffix;
        var fmt = Number.isInteger(num) ? num : num.toFixed(1);
        return (num > 0 ? ('+' + fmt) : String(fmt)) + suffix;
      };

      var formatPercent = function(val, decimals) {
        decimals = decimals !== undefined ? decimals : 1;
        if (val === null || val === undefined || val === '') return '0%';
        var num = Number(val);
        if (!Number.isFinite(num)) return '0%';
        var fmt = num.toFixed(decimals).replace(/\\.0+$/, '');
        return (num > 0 ? ('+' + fmt + '%') : (fmt + '%'));
      };

      var formatPinMethod = function(pinOrMethod) {
        var m = '';
        if (typeof pinOrMethod === 'string') {
          m = pinOrMethod;
        } else if (pinOrMethod && typeof pinOrMethod === 'object') {
          m = pinOrMethod.creation_method || (pinOrMethod.metadata && pinOrMethod.metadata.creation_method) || (pinOrMethod.is_video ? 'video' : 'standard');
        }
        m = String(m || '').toLowerCase().trim();
        if (m.indexOf('carousel') !== -1) return 'Carousel';
        if (m.indexOf('video') !== -1) return 'Video';
        if (m.indexOf('idea') !== -1 || m.indexOf('story') !== -1) return 'Idea';
        if (m.indexOf('product') !== -1) return 'Product';
        return 'Standard';
      };

      var getPinMethodBadgeClass = function(pinOrMethod) {
        var m = formatPinMethod(pinOrMethod).toLowerCase();
        if (m === 'carousel') return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
        if (m === 'video') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
        if (m === 'product') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
        if (m === 'idea') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
        return 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#27272A]';
      };

      var formatTimeframe = function(tf) {
        var t = String(tf || '').trim().toLowerCase();
        if (t === '24h') return '24 Hours';
        if (t === '5d') return '5 Days';
        if (t === '7d') return '7 Days';
        if (t === '15d') return '15 Days';
        return tf || '24h';
      };

      var safeUrl = function(url) {
        if (!url || typeof url !== 'string') return '#';
        var t = url.trim();
        if (t.toLowerCase().indexOf('javascript:') === 0 || t.toLowerCase().indexOf('data:text/html') === 0) return '#';
        return t;
      };

      var safeColor = function(color, fallback) {
        fallback = fallback || '#cbd5e1';
        if (!color || typeof color !== 'string') return fallback;
        var s = color.trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
        if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
        if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(s)) return s;
        return fallback;
      };

      window.PAEFormatters = {
        formatNumber: formatNumber,
        formatUniversalAge: formatUniversalAge,
        formatAge: formatUniversalAge,
        formatVelocity: formatVelocity,
        formatPercent: formatPercent,
        formatPinMethod: formatPinMethod,
        getPinMethodBadgeClass: getPinMethodBadgeClass,
        formatTimeframe: formatTimeframe,
        safeUrl: safeUrl,
        safeColor: safeColor
      };

      // Expose to window for backwards compatibility with inline templates
      if (!window.formatNumber) window.formatNumber = formatNumber;
      if (!window.formatUniversalAge) window.formatUniversalAge = formatUniversalAge;
      if (!window.formatAge) window.formatAge = formatUniversalAge;
      if (!window.formatVelocity) window.formatVelocity = formatVelocity;
      if (!window.formatPercent) window.formatPercent = formatPercent;
      if (!window.formatPinMethod) window.formatPinMethod = formatPinMethod;
      if (!window.getPinMethodBadgeClass) window.getPinMethodBadgeClass = getPinMethodBadgeClass;
      if (!window.formatTimeframe) window.formatTimeframe = formatTimeframe;
      if (!window.safeUrl) window.safeUrl = safeUrl;
      if (!window.safeColor) window.safeColor = safeColor;
    })();
  <\\/script>
  `;
}
