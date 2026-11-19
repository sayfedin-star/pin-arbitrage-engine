/**
 * Pin Annotations Intelligence Service (On-Demand / Lazy Inspector)
 *
 * Resolves official Pinterest Interest metrics (search volume, feed update time,
 * annotation ID, taxonomy category tree, and /ideas/ URL) for a pin's stored
 * visual_annotations + metadata.annotations_with_links using the cached zero-cookie
 * InterestResource lookup with bounded concurrency.
 */

import { fetchPinterestInterestVolume } from '../keywords/trends-service.mjs';

const MAX_ANNOTATIONS_CAP = 15;
const DEFAULT_CONCURRENCY = 4;

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
  return match[1].trim().toLowerCase();
}

export function slugifyAnnotationTerm(term) {
  return String(term || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .trim()
    .replace(/[\s_]+/g, '-');
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

/**
 * Extracts and deduplicates stored pin annotations from `visual_annotations`
 * and `metadata.annotations_with_links`, preserving any stored idea_id / URL.
 */
export function extractStoredPinAnnotations(pinRow, { maxItems = MAX_ANNOTATIONS_CAP } = {}) {
  const safeCap = Math.max(1, Math.min(Number(maxItems) || MAX_ANNOTATIONS_CAP, MAX_ANNOTATIONS_CAP));
  const meta = normalizeMetadataObject(pinRow?.metadata);
  const linkedEntries = parseLinkedAnnotationsSource(meta.annotations_with_links);

  const linkedMap = new Map();
  for (const entry of linkedEntries) {
    const key = entry.name.toLowerCase();
    if (!linkedMap.has(key)) {
      linkedMap.set(key, entry);
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

function buildIdeasLink({ urlName, annotationId, fallbackUrl, term }) {
  const cleanUrlName = String(urlName || '').trim() || extractSlugFromIdeaUrl(fallbackUrl) || slugifyAnnotationTerm(term);
  if (cleanUrlName && annotationId) {
    return `https://www.pinterest.com/ideas/${encodeURIComponent(cleanUrlName)}/${encodeURIComponent(annotationId)}/`;
  }
  if (fallbackUrl && typeof fallbackUrl === 'string') {
    const trimmed = fallbackUrl.trim();
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

/**
 * Resolves InterestResource intelligence for a list of annotation descriptors
 * with bounded concurrency and sorts descending by `search_volume`.
 */
export async function resolveAnnotationsIntel({
  annotations = [],
  fetchInterestFn = fetchPinterestInterestVolume,
  concurrency = DEFAULT_CONCURRENCY,
  force = false
} = {}) {
  const list = Array.isArray(annotations) ? annotations.slice(0, MAX_ANNOTATIONS_CAP) : [];
  if (list.length === 0) {
    return {
      annotations: [],
      total_search_volume: 0,
      checked_count: 0,
      resolved_count: 0
    };
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_CONCURRENCY, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      const item = list[idx];
      let details = null;
      try {
        details = await fetchInterestFn(item.name, { force: Boolean(force) });
      } catch (_) {
        details = null;
      }

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

  await Promise.all(workers);

  results.sort((a, b) => {
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
  const cleanRows = results.map(({ _order, ...row }) => {
    totalSearchVolume += row.search_volume;
    if (row.resolved) resolvedCount++;
    return row;
  });

  return {
    annotations: cleanRows,
    total_search_volume: totalSearchVolume,
    checked_count: cleanRows.length,
    resolved_count: resolvedCount
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
  fetchInterestFn = fetchPinterestInterestVolume
}) {
  const cleanPinId = String(pinId || '').trim();
  const rows = await sql`
    SELECT
      pin_id,
      visual_annotations,
      COALESCE(metadata, '{}'::jsonb) AS metadata
    FROM universal_master_pins
    WHERE pin_id = ${cleanPinId}
    LIMIT 1;
  `;

  const pinRow = Array.isArray(rows) ? rows[0] : null;
  if (!pinRow) {
    return {
      found: false,
      payload: null
    };
  }

  const extracted = extractStoredPinAnnotations(pinRow, { maxItems });
  const resolved = await resolveAnnotationsIntel({
    annotations: extracted.items,
    fetchInterestFn,
    concurrency,
    force
  });

  return {
    found: true,
    payload: {
      success: true,
      pin_id: cleanPinId,
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
