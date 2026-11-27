/**
 * Pin Annotations Intelligence Service (On-Demand / Lazy Inspector)
 *
 * Resolves official Pinterest Interest metrics (search volume, feed update time,
 * annotation ID, taxonomy category tree, and /ideas/ URL) for a pin's stored
 * visual_annotations + metadata.annotations_with_links using the cached zero-cookie
 * InterestResource lookup with bounded concurrency.
 */

import { fetchPinterestInterestVolume, slugifyInterestTerm } from '../keywords/trends-service.mjs';

const MAX_ANNOTATIONS_CAP = 15;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_OVERALL_TIMEOUT_MS = 10500; // Safely below wake-shield 15s timeout ceiling
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 3500;

function safeDecodeUriSegment(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch (_) {
    return str;
  }
}

function normalizeMetadataObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function isCleanAnnotationName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (/^\[object\s+object\]$/i.test(trimmed)) return false;
  return true;
}

export function extractIdeaIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/ideas\/[^/?#]+\/(\d{4,25})(?:\/|$|\?)/i);
  return match ? match[1] : null;
}

export function extractSlugFromIdeaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/ideas\/([^/?#]+)(?:\/|$|\?)/i);
  if (!match || !match[1] || /^\d+$/.test(match[1])) return null;
  return safeDecodeUriSegment(match[1]).toLowerCase();
}

export function slugifyAnnotationTerm(term) {
  return slugifyInterestTerm(term);
}

function parseLinkedAnnotationsSource(rawLinked) {
  const entries = [];
  if (!rawLinked) return entries;

  if (Array.isArray(rawLinked)) {
    for (const item of rawLinked) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name || item.label || item.tag || item.term || '').trim();
      if (!isCleanAnnotationName(name)) continue;
      const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : null;
      const rawId = item.idea_id || item.annotation_id || item.id || extractIdeaIdFromUrl(url);
      const ideaId = rawId && String(rawId).trim() !== '0' ? String(rawId).trim() : null;
      entries.push({ name, idea_id: ideaId, url });
    }
    return entries;
  }

  if (typeof rawLinked === 'object') {
    for (const [key, val] of Object.entries(rawLinked)) {
      if (typeof val === 'string') {
        const name = String(key || '').trim();
        if (!isCleanAnnotationName(name)) continue;
        const url = val.trim() || null;
        const ideaId = extractIdeaIdFromUrl(url);
        entries.push({ name, idea_id: ideaId, url });
      } else if (val && typeof val === 'object') {
        const name = String(val.name || val.label || key || '').trim();
        if (!isCleanAnnotationName(name)) continue;
        const url = typeof val.url === 'string' && val.url.trim() ? val.url.trim() : null;
        const rawId = val.idea_id || val.id || (/^\d{4,25}$/.test(key) ? key : null) || extractIdeaIdFromUrl(url);
        const ideaId = rawId && String(rawId).trim() !== '0' ? String(rawId).trim() : null;
        entries.push({ name, idea_id: ideaId, url });
      }
    }
  }

  return entries;
}

function parseRawTagList(raw) {
  if (!raw) return [];
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      list = [];
    }
  }
  const names = [];
  for (const item of list) {
    const name = typeof item === 'string'
      ? item.trim()
      : (item && typeof item === 'object' ? String(item.name || item.label || item.tag || item.term || '').trim() : '');
    if (isCleanAnnotationName(name)) {
      names.push(name);
    }
  }
  return names;
}

function parseRawLinkedAnnotations(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return parseLinkedAnnotationsSource(JSON.parse(raw));
    } catch (_) {
      return [];
    }
  }
  return parseLinkedAnnotationsSource(raw);
}

/**
 * Extracts and deduplicates stored pin annotations from `visual_annotations`
 * and `metadata.annotations_with_links`, preserving any stored idea_id / URL.
 */
export function extractStoredPinAnnotations(pinRow, { maxItems = MAX_ANNOTATIONS_CAP } = {}) {
  const safeCap = Math.max(1, Math.min(Number(maxItems) || MAX_ANNOTATIONS_CAP, MAX_ANNOTATIONS_CAP));
  const meta = normalizeMetadataObject(pinRow?.metadata);
  const linkedFromMeta = parseRawLinkedAnnotations(meta.annotations_with_links);
  const linkedFromVisual = parseRawLinkedAnnotations(pinRow?.visual_annotations);
  const linkedFromMetaVisual = parseRawLinkedAnnotations(meta.visual_annotations);
  const linkedEntries = [...linkedFromMeta, ...linkedFromVisual, ...linkedFromMetaVisual];

  const linkedMap = new Map();
  for (const entry of linkedEntries) {
    const key = entry.name.toLowerCase();
    const existing = linkedMap.get(key);
    if (!existing) {
      linkedMap.set(key, entry);
    } else {
      linkedMap.set(key, {
        name: existing.name || entry.name,
        idea_id: existing.idea_id || entry.idea_id || null,
        url: existing.url || entry.url || null
      });
    }
  }

  const primaryNames = parseRawTagList(pinRow?.visual_annotations);
  const fallbackMetaNames = primaryNames.length === 0 ? parseRawTagList(meta.visual_annotations) : [];
  const combinedNames = [...primaryNames, ...fallbackMetaNames, ...linkedEntries.map((e) => e.name)];

  const seen = new Set();
  const deduped = [];
  for (const rawName of combinedNames) {
    const key = rawName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const linked = linkedMap.get(key) || null;
    deduped.push({
      name: rawName,
      idea_id: linked?.idea_id || null,
      url: linked?.url || null
    });
  }

  return {
    items: deduped.slice(0, safeCap),
    totalStoredCount: deduped.length,
    capped: deduped.length > safeCap
  };
}

export function formatFeedUpdateTime(rawTime) {
  if (rawTime === null || rawTime === undefined || rawTime === '') return null;
  const str = String(rawTime).trim();
  if (!str || str.includes('1970')) return null;

  let date;
  if (/^\d{10}$/.test(str)) {
    date = new Date(Number(str) * 1000);
  } else if (/^\d{13}$/.test(str)) {
    date = new Date(Number(str));
  } else {
    date = new Date(str);
  }

  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
    return null;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function buildIdeasLink({ urlName, annotationId, fallbackUrl, term }) {
  const decodedUrlName = safeDecodeUriSegment(urlName);
  const cleanUrlName = decodedUrlName || extractSlugFromIdeaUrl(fallbackUrl) || slugifyAnnotationTerm(term);
  if (cleanUrlName && annotationId) {
    return `https://www.pinterest.com/ideas/${encodeURIComponent(cleanUrlName)}/${encodeURIComponent(String(annotationId).trim())}/`;
  }
  if (fallbackUrl && typeof fallbackUrl === 'string') {
    const trimmed = fallbackUrl.trim();
    const ideasMatch = trimmed.match(/^(?:https?:\/\/(?:www\.)?pinterest\.com)?\/ideas\/([^/?#]+)(?:\/(\d{4,25}))?\/?/i);
    if (ideasMatch) {
      const seg = encodeURIComponent(safeDecodeUriSegment(ideasMatch[1]));
      const idSeg = ideasMatch[2] || (annotationId ? String(annotationId).trim() : null);
      return idSeg
        ? `https://www.pinterest.com/ideas/${seg}/${encodeURIComponent(idSeg)}/`
        : `https://www.pinterest.com/ideas/${seg}/`;
    }
    if (/^https?:\/\/(?:www\.)?pinterest\.com\//i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith('/ideas/')) {
      return `https://www.pinterest.com${trimmed}`;
    }
  }
  if (cleanUrlName) {
    return `https://www.pinterest.com/ideas/${encodeURIComponent(cleanUrlName)}/`;
  }
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(String(term || ''))}`;
}

async function runWithDeadlineSignal(promiseFn, signal) {
  if (signal?.aborted) {
    return { aborted: true, value: null };
  }
  return await new Promise((resolve) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      resolve({ aborted: true, value: null });
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    Promise.resolve()
      .then(() => promiseFn())
      .then((value) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve({ aborted: false, value });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve({ aborted: Boolean(signal?.aborted), value: null });
      });
  });
}

/**
 * Resolves InterestResource intelligence for a list of annotation descriptors
 * with bounded concurrency and an overall deadline budget (returning partial:true if exceeded),
 * sorting results descending by `search_volume`.
 */
export async function resolveAnnotationsIntel({
  annotations = [],
  fetchInterestFn = fetchPinterestInterestVolume,
  concurrency = DEFAULT_CONCURRENCY,
  force = false,
  overallTimeoutMs = DEFAULT_OVERALL_TIMEOUT_MS,
  perRequestTimeoutMs = DEFAULT_PER_REQUEST_TIMEOUT_MS,
  env = null
} = {}) {
  const list = Array.isArray(annotations) ? annotations.slice(0, MAX_ANNOTATIONS_CAP) : [];
  if (list.length === 0) {
    return {
      annotations: [],
      total_search_volume: 0,
      checked_count: 0,
      resolved_count: 0,
      partial: false
    };
  }

  const deadlineMs = Math.max(50, Math.min(14000, Number(overallTimeoutMs) || DEFAULT_OVERALL_TIMEOUT_MS));
  const requestTimeoutMs = Math.max(50, Math.min(deadlineMs, Number(perRequestTimeoutMs) || DEFAULT_PER_REQUEST_TIMEOUT_MS));
  const deadlineController = new AbortController();
  let timedOut = false;
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    deadlineController.abort(new Error(`Annotations intel overall timeout (${deadlineMs}ms)`));
  }, deadlineMs);
  if (typeof deadlineTimer.unref === 'function') deadlineTimer.unref();

  const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_CONCURRENCY, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < list.length && !deadlineController.signal.aborted) {
      const idx = cursor++;
      const item = list[idx];
      const outcome = await runWithDeadlineSignal(
        () => fetchInterestFn(item.name, {
          force: Boolean(force),
          signal: deadlineController.signal,
          timeoutMs: requestTimeoutMs,
          env
        }),
        deadlineController.signal
      );

      if (outcome.aborted) {
        timedOut = true;
        break;
      }

      const details = outcome.value;
      const rawVolume = Number(details?.internal_search_count);
      const searchVolume = Number.isFinite(rawVolume) && rawVolume > 0 ? Math.round(rawVolume) : 0;

      const rawInterestId = details?.id && String(details.id).trim() !== '0' ? String(details.id).trim() : null;
      const fallbackId = item.idea_id || extractIdeaIdFromUrl(item.url) || null;
      const annotationId = rawInterestId || fallbackId;

      const breadcrumbs = Array.isArray(details?.seo_breadcrumbs)
        ? details.seo_breadcrumbs
            .map((crumb) => (typeof crumb === 'string' ? crumb.trim() : String(crumb?.name || '').trim()))
            .filter(Boolean)
        : [];
      const categoryTreeText = breadcrumbs.join(' > ');

      const rawFeedUpdate = details?.feed_update_time ?? null;
      const lastUpdated = (rawFeedUpdate && !String(rawFeedUpdate).includes('1970')) ? rawFeedUpdate : null;
      const lastUpdatedDisplay = formatFeedUpdateTime(lastUpdated);

      const link = buildIdeasLink({
        urlName: details?.url_name,
        annotationId,
        fallbackUrl: item.url,
        term: item.name
      });

      results[idx] = {
        annotation: item.name,
        search_volume: searchVolume,
        last_updated: lastUpdated,
        last_updated_display: lastUpdatedDisplay,
        annotation_id: annotationId,
        category_tree: breadcrumbs,
        category_tree_text: categoryTreeText,
        link,
        resolved: Boolean(details && details.success),
        _order: idx
      };
    }
  });

  try {
    await Promise.all(workers);
  } finally {
    clearTimeout(deadlineTimer);
  }

  const completed = results.filter(Boolean);
  const isPartial = Boolean(timedOut || completed.length < list.length);

  completed.sort((a, b) => {
    if (b.search_volume !== a.search_volume) {
      return b.search_volume - a.search_volume;
    }
    if (a.resolved !== b.resolved) {
      return a.resolved ? -1 : 1;
    }
    return a._order - b._order;
  });

  let totalSearchVolume = 0;
  let resolvedCount = 0;
  const cleanRows = completed.map(({ _order, ...row }) => {
    totalSearchVolume += row.search_volume;
    if (row.resolved) resolvedCount++;
    return row;
  });

  return {
    annotations: cleanRows,
    total_search_volume: totalSearchVolume,
    checked_count: cleanRows.length,
    resolved_count: resolvedCount,
    partial: isPartial
  };
}

/**
 * Loads a pin's stored annotations from PostgreSQL and resolves on-demand
 * Pinterest Interest metrics (0 DB writes, 0 cookies).
 */
export async function fetchPinAnnotationsIntel({
  sql,
  pinId,
  force = false,
  concurrency = DEFAULT_CONCURRENCY,
  maxItems = MAX_ANNOTATIONS_CAP,
  overallTimeoutMs = DEFAULT_OVERALL_TIMEOUT_MS,
  perRequestTimeoutMs = DEFAULT_PER_REQUEST_TIMEOUT_MS,
  env = null,
  fetchInterestFn = fetchPinterestInterestVolume
}) {
  const cleanPinId = String(pinId || '').trim();
  const rows = await sql`
    SELECT pin_id, visual_annotations, metadata, priority FROM (
      SELECT
        pin_id,
        visual_annotations,
        COALESCE(metadata, '{}'::jsonb) AS metadata,
        1 AS priority
      FROM universal_master_pins
      WHERE pin_id = ${cleanPinId}
      UNION ALL
      SELECT
        pin_id,
        visual_annotations,
        COALESCE(metadata, '{}'::jsonb) AS metadata,
        2 AS priority
      FROM newborn_candidates
      WHERE pin_id = ${cleanPinId}
    ) unified_pin_annotations
    ORDER BY priority ASC
    LIMIT 2;
  `;

  const rowList = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (rowList.length === 0) {
    return {
      found: false,
      payload: null
    };
  }

  const safeCap = Math.max(1, Math.min(Number(maxItems) || MAX_ANNOTATIONS_CAP, MAX_ANNOTATIONS_CAP));
  const mergedByKey = new Map();
  for (const row of rowList) {
    const part = extractStoredPinAnnotations(row, { maxItems: MAX_ANNOTATIONS_CAP });
    for (const item of part.items) {
      const key = item.name.toLowerCase();
      const existing = mergedByKey.get(key);
      if (!existing) {
        mergedByKey.set(key, { ...item });
      } else {
        mergedByKey.set(key, {
          name: existing.name || item.name,
          idea_id: existing.idea_id || item.idea_id || null,
          url: existing.url || item.url || null
        });
      }
    }
  }
  const allMerged = Array.from(mergedByKey.values());
  const extracted = {
    items: allMerged.slice(0, safeCap),
    totalStoredCount: allMerged.length,
    capped: allMerged.length > safeCap
  };
  const resolved = await resolveAnnotationsIntel({
    annotations: extracted.items,
    fetchInterestFn,
    concurrency,
    force,
    overallTimeoutMs,
    perRequestTimeoutMs,
    env
  });

  return {
    found: true,
    payload: {
      success: true,
      pin_id: cleanPinId,
      partial: Boolean(resolved.partial),
      annotations: resolved.annotations,
      total_search_volume: resolved.total_search_volume,
      checked_count: resolved.checked_count,
      resolved_count: resolved.resolved_count,
      total_stored_count: extracted.totalStoredCount,
      capped: extracted.capped,
      fetched_at: new Date().toISOString()
    }
  };
}
