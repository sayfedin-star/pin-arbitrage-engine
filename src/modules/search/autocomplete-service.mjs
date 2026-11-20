/**
 * src/modules/search/autocomplete-service.mjs
 *
 * Instant Multi-Entity Live Search Service
 * Parallel sub-15ms PostgreSQL search across:
 * 1. Keywords (tracked_keywords + active SERP count)
 * 2. Creators & Accounts (competitor_profiles: username + display_name)
 * 3. Campaign Folders (keyword_folders + keyword count)
 * 4. Domains (domain_intelligence_rollup: pin-backed real domains)
 */

import { escapeSqlWildcards } from '../../utils.mjs';
import { RESERVED_KEYWORD_SLUGS } from '../../http/security-and-response.mjs';

export const AUTOCOMPLETE_MIN_CHARS = 2;
export const AUTOCOMPLETE_MAX_QUERY_LEN = 80;
export const AUTOCOMPLETE_DEFAULT_LIMIT = 5;
export const AUTOCOMPLETE_MAX_LIMIT = 10;

const VALID_ENTITY_TYPES = new Set(['keywords', 'creators', 'folders', 'domains']);

/**
 * Normalize and sanitize incoming search query into prefix & substring LIKE patterns.
 */
export function normalizeAutocompleteQuery(rawQuery) {
  const raw = String(rawQuery || '').replace(/\s+/g, ' ').trim().slice(0, AUTOCOMPLETE_MAX_QUERY_LEN);
  const lower = raw.toLowerCase();
  const creatorLower = lower.replace(/^@+/, '').trim();
  const effectiveLen = Math.max(lower.length, creatorLower.length);
  const tooShort = lower.length < AUTOCOMPLETE_MIN_CHARS || (raw.startsWith('@') && creatorLower.length < AUTOCOMPLETE_MIN_CHARS);
  const isShortPrefix = lower.length === AUTOCOMPLETE_MIN_CHARS;
  const escapedLower = escapeSqlWildcards(lower);
  const escapedCreatorLower = escapeSqlWildcards(creatorLower);

  const prefixPattern = `${escapedLower}%`;
  const matchPattern = isShortPrefix ? prefixPattern : `%${escapedLower}%`;

  const creatorPrefixPattern = `${escapedCreatorLower}%`;
  const creatorMatchPattern = creatorLower.length <= AUTOCOMPLETE_MIN_CHARS
    ? creatorPrefixPattern
    : `%${escapedCreatorLower}%`;

  return {
    raw,
    lower,
    creatorLower,
    effectiveLen,
    tooShort,
    isShortPrefix,
    prefixPattern,
    matchPattern,
    creatorPrefixPattern,
    creatorMatchPattern
  };
}

/**
 * Resolve canonical URL for a tracked keyword row.
 */
export function resolveKeywordUrl(row) {
  const canonical = row?.canonical_keyword ? String(row.canonical_keyword).trim() : '';
  const slug = canonical || String(row?.keyword || '').trim().toLowerCase().replace(/\s+/g, '-');
  return slug ? `/keywords/${encodeURIComponent(slug)}` : '/keywords';
}

/**
 * Resolve canonical URL for a creator username, protecting against reserved system slugs.
 */
export function resolveCreatorUrl(username) {
  const clean = String(username || '').replace(/^@+/, '').trim();
  if (!clean) return '/accounts';
  if (RESERVED_KEYWORD_SLUGS.has(clean.toLowerCase())) {
    return `/accounts?creator=${encodeURIComponent(clean)}`;
  }
  return `/${encodeURIComponent(clean)}`;
}

/**
 * Parse requested entity types CSV into a Set of valid entity keys.
 */
export function parseRequestedTypes(rawTypes) {
  if (!rawTypes || typeof rawTypes !== 'string') {
    return new Set(VALID_ENTITY_TYPES);
  }
  const parsed = new Set(
    rawTypes
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => VALID_ENTITY_TYPES.has(s))
  );
  return parsed.size > 0 ? parsed : new Set(VALID_ENTITY_TYPES);
}

/**
 * Execute parallel multi-entity PostgreSQL search across Keywords, Creators, Folders, and Domains.
 */
export async function searchMultiEntityAutocomplete(sql, {
  query = '',
  limit = AUTOCOMPLETE_DEFAULT_LIMIT,
  types = null,
  projectId = 'default'
} = {}) {
  const startMs = Date.now();
  const parsedLimit = Number(limit);
  const lim = Math.max(1, Math.min(isNaN(parsedLimit) ? AUTOCOMPLETE_DEFAULT_LIMIT : Math.floor(parsedLimit), AUTOCOMPLETE_MAX_LIMIT));
  const norm = normalizeAutocompleteQuery(query);
  const activeTypes = types instanceof Set ? types : parseRequestedTypes(types);

  if (!sql || norm.tooShort) {
    return {
      success: true,
      source: 'min_chars',
      query: norm.raw,
      min_chars_required: AUTOCOMPLETE_MIN_CHARS,
      took_ms: 0,
      counts: { keywords: 0, creators: 0, folders: 0, domains: 0, total: 0 },
      entities: { keywords: [], creators: [], folders: [], domains: [] },
      results: []
    };
  }

  const runKeywords = activeTypes.has('keywords') && !norm.raw.startsWith('@');
  const runCreators = activeTypes.has('creators') && norm.creatorLower.length >= AUTOCOMPLETE_MIN_CHARS;
  const runFolders = activeTypes.has('folders') && !norm.raw.startsWith('@');
  const runDomains = activeTypes.has('domains') && !norm.raw.startsWith('@');

  const [kwRows, cpRows, kfRows, domRows] = await Promise.all([
    runKeywords
      ? sql`
          SELECT
            tk.id,
            tk.keyword,
            tk.canonical_keyword,
            tk.category,
            tk.is_active,
            tk.target_pin_count,
            tk.avg_daily_velocity,
            (
              SELECT COUNT(*)::int
              FROM keyword_serp_positions ksp
              WHERE ksp.keyword_id = tk.id
                AND ksp.is_displaced = FALSE
                AND ksp.rank_position >= 1
            ) AS active_pin_count
          FROM tracked_keywords tk
          WHERE LOWER(tk.keyword) LIKE ${norm.matchPattern} ESCAPE '\\'
          ORDER BY
            CASE WHEN LOWER(tk.keyword) LIKE ${norm.prefixPattern} ESCAPE '\\' THEN 0 ELSE 1 END,
            tk.is_active DESC,
            tk.avg_daily_velocity DESC NULLS LAST,
            tk.keyword ASC
          LIMIT ${lim};
        `
      : Promise.resolve([]),

    runCreators
      ? sql`
          SELECT
            cp.id,
            cp.username,
            cp.display_name,
            cp.avatar_url,
            cp.monthly_reach,
            cp.follower_count,
            cp.total_pins,
            cp.account_type
          FROM competitor_profiles cp
          WHERE COALESCE(cp.account_type, 'competitor') <> 'system'
            AND (
              LOWER(cp.username) LIKE ${norm.creatorMatchPattern} ESCAPE '\\'
              OR LOWER(COALESCE(cp.display_name, '')) LIKE ${norm.creatorMatchPattern} ESCAPE '\\'
            )
          ORDER BY
            CASE
              WHEN LOWER(cp.username) = ${norm.creatorLower} THEN 0
              WHEN LOWER(cp.username) LIKE ${norm.creatorPrefixPattern} ESCAPE '\\' THEN 1
              WHEN LOWER(COALESCE(cp.display_name, '')) LIKE ${norm.creatorPrefixPattern} ESCAPE '\\' THEN 2
              ELSE 3
            END,
            cp.monthly_reach DESC NULLS LAST,
            cp.follower_count DESC NULLS LAST,
            cp.username ASC
          LIMIT ${lim};
        `
      : Promise.resolve([]),

    runFolders
      ? sql`
          SELECT
            kf.id,
            kf.name,
            kf.description,
            kf.color,
            kf.icon,
            (
              SELECT COUNT(*)::int
              FROM keyword_folder_items kfi
              WHERE kfi.folder_id = kf.id
            ) AS keyword_count
          FROM keyword_folders kf
          WHERE kf.project_id = ${projectId}
            AND LOWER(kf.name) LIKE ${norm.matchPattern} ESCAPE '\\'
          ORDER BY
            CASE WHEN LOWER(kf.name) LIKE ${norm.prefixPattern} ESCAPE '\\' THEN 0 ELSE 1 END,
            kf.updated_at DESC NULLS LAST,
            kf.name ASC
          LIMIT ${lim};
        `
      : Promise.resolve([]),

    runDomains
      ? sql`
          SELECT
            r.domain,
            r.total_pins,
            r.active_serp_pins,
            r.total_saves,
            r.avg_velocity,
            r.ad_network,
            r.age_years
          FROM domain_intelligence_rollup r
          WHERE r.total_pins > 0
            AND r.domain <> 'Uploaded by user'
            AND LOWER(r.domain) LIKE ${norm.matchPattern} ESCAPE '\\'
          ORDER BY
            CASE WHEN LOWER(r.domain) LIKE ${norm.prefixPattern} ESCAPE '\\' THEN 0 ELSE 1 END,
            r.total_saves DESC NULLS LAST,
            r.total_pins DESC,
            r.domain ASC
          LIMIT ${lim};
        `
      : Promise.resolve([])
  ]);

  const keywords = (kwRows || []).map(r => {
    const url = resolveKeywordUrl(r);
    const activePins = Number(r.active_pin_count || 0);
    return {
      type: 'keyword',
      id: Number(r.id),
      label: r.keyword,
      keyword: r.keyword,
      slug: r.canonical_keyword || String(r.keyword || '').trim().toLowerCase().replace(/\s+/g, '-'),
      category: r.category || 'General',
      is_active: r.is_active !== false,
      active_pin_count: activePins,
      target_pin_count: Number(r.target_pin_count || 0),
      avg_daily_velocity: Number(r.avg_daily_velocity || 0),
      url
    };
  });

  const creators = (cpRows || []).map(r => ({
    type: 'creator',
    id: Number(r.id),
    username: r.username,
    display_name: r.display_name || r.username,
    avatar_url: r.avatar_url || '',
    monthly_reach: Number(r.monthly_reach || 0),
    follower_count: Number(r.follower_count || 0),
    total_pins: Number(r.total_pins || 0),
    account_type: r.account_type || 'competitor',
    url: resolveCreatorUrl(r.username)
  }));

  const folders = (kfRows || []).map(r => ({
    type: 'folder',
    id: Number(r.id),
    name: r.name,
    description: r.description || '',
    color: r.color || '#6366f1',
    icon: r.icon || 'folder',
    keyword_count: Number(r.keyword_count || 0),
    url: `/folders/${encodeURIComponent(String(r.id))}`
  }));

  const domains = (domRows || []).map(r => ({
    type: 'domain',
    domain: r.domain,
    total_pins: Number(r.total_pins || 0),
    active_serp_pins: Number(r.active_serp_pins || 0),
    total_saves: Number(r.total_saves || 0),
    avg_velocity: Number(r.avg_velocity || 0),
    ad_network: r.ad_network || 'unchecked',
    age_years: r.age_years != null ? Number(r.age_years) : null,
    url: `/domains/${encodeURIComponent(String(r.domain))}`
  }));

  // Preserve backward compatibility for legacy /api/keywords/autocomplete consumers
  const results = keywords.map(k => ({
    id: k.id,
    keyword: k.keyword,
    slug: k.slug,
    url: k.url,
    search_volume: k.target_pin_count,
    pin_count: k.active_pin_count,
    active_pin_count: k.active_pin_count,
    avg_daily_velocity: k.avg_daily_velocity,
    is_active: k.is_active,
    category: k.category
  }));

  const total = keywords.length + creators.length + folders.length + domains.length;

  return {
    success: true,
    source: 'unified_postgres',
    query: norm.raw,
    took_ms: Math.max(0, Date.now() - startMs),
    counts: {
      keywords: keywords.length,
      creators: creators.length,
      folders: folders.length,
      domains: domains.length,
      total
    },
    entities: {
      keywords,
      creators,
      folders,
      domains
    },
    results
  };
}
