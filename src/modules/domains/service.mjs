/**
 * src/modules/domains/service.mjs
 *
 * Cross-Pillar Domain Intelligence, SERP Monopoly & WHOIS Age Engine
 *
 * Features:
 * - Unifies domain occurrences across keyword_serp_current (SERP Radar), pa_pins (PinArchive), and competitor_pins.
 * - Fetch-Once Domain Age lookup via api.domainee.dev with automatic IANA RDAP fallback and 8000ms AbortSignal timeout.
 * - Computes SERP Visibility Score, Pin-to-Article Multiplication Ratio, Multi-Account Network Detection, and Arbitrage Score.
 * - Deep Domain Dossier: Ranked Pins per Keyword, Top Money Article Slugs (with creative pin variations), and Keyword Monopoly Matrix.
 */

import { sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
import {
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  KNOWN_AD_NETWORKS,
  AD_NETWORK_DISPLAY_CONFIG
} from './ad-network-service.mjs';

export {
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  KNOWN_AD_NETWORKS,
  AD_NETWORK_DISPLAY_CONFIG
};

export const IGNORED_INTERNAL_DOMAINS = [
  'pinterest.com',
  'www.pinterest.com',
  'pin.it',
  'uploaded by user',
  'localhost'
];

export const ECOMMERCE_AND_SOCIAL_DOMAINS = [
  // Marketplaces & Ecommerce Giants
  'etsy.com',
  'amazon.com',
  'amazon.co.uk',
  'amzn.to',
  'walmart.com',
  'target.com',
  'ebay.com',
  'aliexpress.com',
  'temu.com',
  'shein.com',
  // Influencer / Affiliate Shorteners
  'ltks.co',
  'liketoknow.it',
  'shopltk.com',
  'rstyle.me',
  'shopstyle.it',
  // Social Platforms & Forums
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'threads.net',
  'linkedin.com',
  'quora.com',
  'tumblr.com',
  'medium.com',
  'wikipedia.org',
  // Google System / Cloud / Share URLs
  'google.com',
  'share.google',
  'drive.google.com',
  'docs.google.com',
  'storage.googleapis.com',
  'blogger.googleusercontent.com'
];

export const BLOCKED_TLD_SUFFIXES = [
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.test',
  '.example',
  '.invalid',
  '.arpa',
  '.onion',
  '.localhost'
];

/**
 * Normalizes any domain or URL into a clean lowercase root host without 'www.'
 */
export function normalizeCleanDomain(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let cleaned = rawInput.trim().toLowerCase();
  if (!cleaned) return '';
  try {
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      cleaned = new URL(cleaned).hostname.toLowerCase();
    } else {
      cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    }
  } catch (_) {
    cleaned = cleaned.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  }
  cleaned = cleaned.replace(/^www\./, '').trim();
  if (!cleaned || !cleaned.includes('.') || IGNORED_INTERNAL_DOMAINS.includes(cleaned)) {
    return '';
  }
  if (cleaned.startsWith('.') || cleaned.endsWith('.') || cleaned.includes('..')) {
    return '';
  }
  if (BLOCKED_TLD_SUFFIXES.some(suffix => cleaned === suffix.slice(1) || cleaned.endsWith(suffix))) {
    return '';
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/.test(cleaned)) {
    return '';
  }
  const parts = cleaned.split('.');
  if (parts.some(p => !p || p.startsWith('-') || p.endsWith('-'))) {
    return '';
  }
  return cleaned;
}

/**
 * Escapes SQL LIKE/ILIKE wildcard characters (%, _, \) in user search strings
 */
export function escapeSqlLike(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
}

/**
 * Direct Socket WHOIS for ccTLDs (.me, .co, .io, .ai, etc.)
 */
export async function queryWhoisSocket(cleanDomain) {
  try {
    const net = await import('node:net');
    if (!net || typeof net.createConnection !== 'function') return null;

    const tld = cleanDomain.split('.').pop().toLowerCase();
    const WHOIS_SERVERS = {
      me: 'whois.nic.me',
      co: 'whois.nic.co',
      io: 'whois.nic.io',
      ai: 'whois.nic.ai',
      ca: 'whois.cira.ca',
      uk: 'whois.nic.uk',
      de: 'whois.denic.de',
      fr: 'whois.nic.fr',
      app: 'whois.nic.google',
      dev: 'whois.nic.google'
    };

    const host = WHOIS_SERVERS[tld] || `whois.nic.${tld}`;

    return await new Promise((resolve) => {
      const socket = net.createConnection(43, host, () => {
        socket.write(`${cleanDomain}\r\n`);
      });
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
      });
      socket.on('end', () => resolve(buffer));
      socket.on('error', () => resolve(null));
      socket.setTimeout(3500, () => {
        socket.destroy();
        resolve(buffer || null);
      });
    });
  } catch (_) {
    return null;
  }
}

/**
 * Fetch-Once Domain Age & WHOIS Registration Resolver
 * Primary: https://api.domainee.dev/v1/tools/domain-age-checker?domain=http://<domain>/
 * Fallback: https://rdap.org/domain/<domain>
 */
export async function fetchAndCacheDomainAge(sql, rawDomain, { forceRefresh = false } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) return null;

  if (!forceRefresh) {
    try {
      const [cached] = await sql`
        SELECT
          domain,
          registered_at,
          updated_at_whois,
          expires_at,
          lookup_source,
          lookup_status,
          checked_at,
          CASE
            WHEN registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - registered_at)) / 86400))::int
            ELSE initial_age_days
          END AS age_days,
          CASE
            WHEN registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (NOW() - registered_at)) / 31557600)::numeric, 2)
            ELSE initial_age_years
          END AS age_years
        FROM domain_registry_metadata
        WHERE domain = ${cleanDomain}
          AND (
            lookup_status = 'resolved'
            OR (lookup_status = 'failed' AND checked_at > NOW() - INTERVAL '3 days')
          )
        LIMIT 1;
      `;
      if (cached && (cached.lookup_status === 'resolved' || !forceRefresh)) {
        return {
          ...cached,
          age_days: cached.age_days != null ? Number(cached.age_days) : null,
          age_years: cached.age_years != null ? Number(cached.age_years) : null
        };
      }
    } catch (_) {}
  }

  let created = null;
  let updated = null;
  let expires = null;
  let ageDays = null;
  let ageYears = null;
  let source = 'domainee';

  const tld = cleanDomain.split('.').pop();

  // Tier 1: Direct Authoritative Registry RDAP (Sub-second latency, zero Cloudflare blocking)
  let directRdapUrl = null;
  if (tld === 'com') directRdapUrl = `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(cleanDomain)}`;
  else if (tld === 'net') directRdapUrl = `https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(cleanDomain)}`;
  else if (tld === 'org') directRdapUrl = `https://rdap.publicinterestregistry.org/rdap/domain/${encodeURIComponent(cleanDomain)}`;
  else if (['info', 'pro', 'mobi', 'live', 'life'].includes(tld)) directRdapUrl = `https://rdap.identitydigital.services/rdap/domain/${encodeURIComponent(cleanDomain)}`;

  if (directRdapUrl) {
    try {
      const rdapRes = await fetch(directRdapUrl, {
        headers: {
          'Accept': 'application/rdap+json, application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (rdapRes.ok) {
        const rdap = await rdapRes.json();
        const events = Array.isArray(rdap?.events) ? rdap.events : [];
        const regEvent = events.find(e => e.eventAction === 'registration');
        const updEvent = events.find(e => e.eventAction === 'last changed');
        const expEvent = events.find(e => e.eventAction === 'expiration');
        if (regEvent?.eventDate) {
          created = regEvent.eventDate;
          updated = updEvent?.eventDate || null;
          expires = expEvent?.eventDate || null;
          source = (tld === 'com' || tld === 'net') ? 'verisign' : (tld === 'org' ? 'pir' : 'identity_digital');
        }
      } else if (rdapRes.body) {
        await rdapRes.body.cancel().catch(() => {});
      }
    } catch (_) {}
  }

  // Tier 2: Direct Socket WHOIS for ccTLDs (.me, .co, .io, .ai, etc.)
  if (!created) {
    try {
      const whoisRaw = await queryWhoisSocket(cleanDomain);
      if (whoisRaw) {
        const regMatch = whoisRaw.match(/(?:Creation Date|Created On|Registration Time|Registered on|registered):\s*([^\r\n]+)/i);
        const updMatch = whoisRaw.match(/(?:Updated Date|Last Updated On|Last Modified):\s*([^\r\n]+)/i);
        const expMatch = whoisRaw.match(/(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expires on):\s*([^\r\n]+)/i);
        if (regMatch?.[1]) {
          const parsed = new Date(regMatch[1].trim());
          if (!isNaN(parsed.getTime())) {
            created = parsed.toISOString();
            updated = (updMatch?.[1] && !isNaN(new Date(updMatch[1].trim()).getTime())) ? new Date(updMatch[1].trim()).toISOString() : null;
            expires = (expMatch?.[1] && !isNaN(new Date(expMatch[1].trim()).getTime())) ? new Date(expMatch[1].trim()).toISOString() : null;
            source = 'whois_socket';
          }
        }
      }
    } catch (_) {}
  }

  // Tier 3: Primary Multi-TLD Resolver Gateway (api.domainee.dev)
  if (!created) {
    try {
      const apiUrl = `https://api.domainee.dev/v1/tools/domain-age-checker?domain=${encodeURIComponent(`http://${cleanDomain}/`)}`;
      const res = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const payload = await res.json();
        const d = payload?.data || payload;
        if (payload?.ok !== false && d?.created) {
          created = d.created;
          updated = d.updated || null;
          expires = d.expires || null;
          ageDays = Number(d.ageDays) > 0 ? Math.round(Number(d.ageDays)) : null;
          ageYears = Number(d.ageYears) > 0 ? Number(Number(d.ageYears).toFixed(2)) : null;
          source = 'domainee';
        }
      } else if (res.body) {
        await res.body.cancel().catch(() => {});
      }
    } catch (_) {}
  }

  // Tier 4: Certificate Transparency Logs (crt.sh) - Crucial for privacy-protected domains
  if (!created) {
    try {
      const crtUrl = `https://crt.sh/?q=${encodeURIComponent(cleanDomain)}&output=json`;
      const crtRes = await fetch(crtUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        signal: AbortSignal.timeout(7000)
      });
      if (crtRes.ok) {
        const certs = await crtRes.json();
        if (Array.isArray(certs) && certs.length > 0) {
          const nowMs = Date.now();
          const validDates = certs
            .map(c => c.not_before)
            .filter(Boolean)
            .map(d => new Date(d).getTime())
            .filter(t => !isNaN(t) && t >= 1356998400000 && t <= nowMs) // 2013 onwards
            .sort((a, b) => a - b);
          if (validDates.length > 0) {
            created = new Date(validDates[0]).toISOString();
            source = 'crt_sh';
          }
        }
      } else if (crtRes.body) {
        await crtRes.body.cancel().catch(() => {});
      }
    } catch (_) {}
  }

  const nowMs = Date.now();
  const parsedCreated = created ? new Date(created) : null;
  const isValidCreated = Boolean(
    parsedCreated &&
    !isNaN(parsedCreated.getTime()) &&
    parsedCreated.getUTCFullYear() >= 1985 &&
    parsedCreated.getTime() <= (nowMs + 86400000)
  );
  const parsedUpdated = (updated && !isNaN(new Date(updated).getTime())) ? new Date(updated).toISOString() : null;
  const parsedExpires = (expires && !isNaN(new Date(expires).getTime())) ? new Date(expires).toISOString() : null;

  if (isValidCreated) {
    const computedDays = Math.max(1, Math.floor((nowMs - parsedCreated.getTime()) / 86400000));
    ageDays = (ageDays && ageDays > 0 && ageDays < 25000) ? ageDays : computedDays;
    ageYears = (ageYears && ageYears > 0 && ageYears < 68) ? ageYears : Number((computedDays / 365.25).toFixed(2));
  } else {
    ageDays = null;
    ageYears = null;
  }

  const status = isValidCreated ? 'resolved' : 'failed';

  try {
    const [saved] = await sql`
      INSERT INTO domain_registry_metadata (
        domain, registered_at, updated_at_whois, expires_at,
        initial_age_days, initial_age_years, lookup_source, lookup_status, checked_at
      ) VALUES (
        ${cleanDomain},
        ${isValidCreated ? parsedCreated.toISOString() : null},
        ${parsedUpdated},
        ${parsedExpires},
        ${ageDays},
        ${ageYears},
        ${source},
        ${status},
        NOW()
      )
      ON CONFLICT (domain) DO UPDATE SET
        registered_at = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.registered_at ELSE domain_registry_metadata.registered_at END,
        updated_at_whois = COALESCE(EXCLUDED.updated_at_whois, domain_registry_metadata.updated_at_whois),
        expires_at = COALESCE(EXCLUDED.expires_at, domain_registry_metadata.expires_at),
        initial_age_days = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.initial_age_days ELSE domain_registry_metadata.initial_age_days END,
        initial_age_years = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.initial_age_years ELSE domain_registry_metadata.initial_age_years END,
        lookup_source = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.lookup_source ELSE domain_registry_metadata.lookup_source END,
        lookup_status = CASE
          WHEN EXCLUDED.lookup_status = 'resolved' THEN 'resolved'
          WHEN domain_registry_metadata.lookup_status = 'resolved' THEN 'resolved'
          ELSE EXCLUDED.lookup_status
        END,
        checked_at = NOW()
      RETURNING
        domain,
        registered_at,
        updated_at_whois,
        expires_at,
        lookup_source,
        lookup_status,
        CASE
          WHEN registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - registered_at)) / 86400))::int
          ELSE initial_age_days
        END AS age_days,
        CASE
          WHEN registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (NOW() - registered_at)) / 31557600)::numeric, 2)
          ELSE initial_age_years
        END AS age_years;
    `;
    return saved ? {
      ...saved,
      age_days: saved.age_days != null ? Number(saved.age_days) : null,
      age_years: saved.age_years != null ? Number(saved.age_years) : null
    } : null;
  } catch (_) {
    return {
      domain: cleanDomain,
      registered_at: isValidCreated ? parsedCreated.toISOString() : null,
      updated_at_whois: parsedUpdated,
      expires_at: parsedExpires,
      age_days: ageDays,
      age_years: ageYears,
      lookup_source: source,
      lookup_status: status
    };
  }
}

/**
 * Enriches a bounded batch of unchecked domains with safe jitter
 */
export async function enrichMissingDomainsBatch(sql, candidateDomains = [], maxBatch = 8, { forceRefresh = false } = {}) {
  if (!Array.isArray(candidateDomains)) return { enriched: 0, results: [] };
  const safeMax = Math.max(1, Math.min(Number(maxBatch) || 8, 50));
  const safeCandidates = candidateDomains.slice(0, 100);
  const unique = [...new Set(safeCandidates.map(normalizeCleanDomain).filter(Boolean))].slice(0, safeMax);
  if (unique.length === 0) return { enriched: 0, results: [] };

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const res = await fetchAndCacheDomainAge(sql, unique[i], { forceRefresh });
    if (res) results.push(res);
    if (i < unique.length - 1) {
      await sleep(randomJitterMs(350, 750));
    }
  }
  return { enriched: results.length, results };
}

/**
 * Global Database Enrichment Statistics:
 * Returns aggregate count of total valid unique domains, checked, resolved, failed, and percent complete.
 */
export async function getDatabaseEnrichmentStats(sql) {
  try {
    const [stats] = await sql`
      WITH all_domains AS (
        SELECT DISTINCT LOWER(REGEXP_REPLACE(domain, '^www\\.', '')) AS clean_domain
        FROM keyword_serp_current
        WHERE domain IS NOT NULL AND domain <> ''
        UNION
        SELECT DISTINCT LOWER(REGEXP_REPLACE(domain, '^www\\.', '')) AS clean_domain
        FROM universal_master_pins
        WHERE domain IS NOT NULL AND domain <> ''
        UNION
        SELECT DISTINCT LOWER(REGEXP_REPLACE(cp.link_domain, '^www\\.', '')) AS clean_domain
        FROM competitor_pins cp
        WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
      ),
      valid_domains AS (
        SELECT clean_domain
        FROM all_domains
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
          AND clean_domain LIKE '%.%'
          AND clean_domain NOT LIKE '% %'
          AND LENGTH(clean_domain) >= 4
          AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
          AND clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[])
      )
      SELECT
        COUNT(*)::int AS total_domains,
        COUNT(drm.domain)::int AS checked_domains,
        COUNT(drm.domain) FILTER (WHERE drm.lookup_status = 'resolved')::int AS resolved_domains,
        COUNT(drm.domain) FILTER (WHERE drm.lookup_status = 'failed')::int AS failed_domains,
        (COUNT(*) - COUNT(drm.domain))::int AS unchecked_domains,
        ROUND((COUNT(drm.domain)::numeric / GREATEST(1, COUNT(*))) * 100, 1) AS percent_complete
      FROM valid_domains vd
      LEFT JOIN domain_registry_metadata drm ON drm.domain = vd.clean_domain;
    `;
    return {
      total_domains: Number(stats?.total_domains || 0),
      checked_domains: Number(stats?.checked_domains || 0),
      resolved_domains: Number(stats?.resolved_domains || 0),
      failed_domains: Number(stats?.failed_domains || 0),
      unchecked_domains: Number(stats?.unchecked_domains || 0),
      percent_complete: Number(stats?.percent_complete || 0)
    };
  } catch (err) {
    return {
      total_domains: 0,
      checked_domains: 0,
      resolved_domains: 0,
      failed_domains: 0,
      unchecked_domains: 0,
      percent_complete: 0,
      error: err.message
    };
  }
}

/**
 * Enriches the next priority batch of unchecked domains in the database:
 * Selects domains ordered by visibility_score DESC and total_saves DESC,
 * resolves them using the multi-tier engine with safe concurrency and jitter.
 */
export async function enrichNextUncheckedBatch(sql, { batchSize = 20, concurrency = 3, forceRefresh = false } = {}) {
  const lim = Math.max(1, Math.min(Number(batchSize) || 20, 50));
  const conc = Math.max(1, Math.min(Number(concurrency) || 3, 5));

  const candidateRows = await sql`
    WITH all_candidates AS (
      SELECT
        LOWER(REGEXP_REPLACE(ksc.domain, '^www\\.', '')) AS clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(ksc.rank_position, 50))))::bigint AS visibility_score,
        SUM(COALESCE(ksc.save_count, 0))::bigint AS total_saves
      FROM keyword_serp_current ksc
      WHERE ksc.domain IS NOT NULL AND ksc.domain <> ''
      GROUP BY clean_domain

      UNION ALL

      SELECT
        LOWER(REGEXP_REPLACE(ump.domain, '^www\\.', '')) AS clean_domain,
        0::bigint AS visibility_score,
        0::bigint AS total_saves
      FROM universal_master_pins ump
      WHERE ump.domain IS NOT NULL AND ump.domain <> ''
      GROUP BY clean_domain

      UNION ALL

      SELECT
        LOWER(REGEXP_REPLACE(cp.link_domain, '^www\\.', '')) AS clean_domain,
        0::bigint AS visibility_score,
        SUM(COALESCE(cp.save_count, 0))::bigint AS total_saves
      FROM competitor_pins cp
      WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
      GROUP BY clean_domain
    ),
    aggregated AS (
      SELECT
        clean_domain AS domain,
        SUM(visibility_score)::bigint AS visibility_score,
        SUM(total_saves)::bigint AS total_saves
      FROM all_candidates
      WHERE clean_domain IS NOT NULL
        AND clean_domain <> ''
        AND clean_domain LIKE '%.%'
        AND clean_domain NOT LIKE '% %'
        AND LENGTH(clean_domain) >= 4
        AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
        AND clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[])
      GROUP BY clean_domain
    )
    SELECT agg.domain
    FROM aggregated agg
    LEFT JOIN domain_registry_metadata drm ON drm.domain = agg.domain
    WHERE (
      ${forceRefresh} = TRUE
      OR drm.domain IS NULL
      OR (drm.lookup_status = 'failed' AND drm.checked_at < NOW() - INTERVAL '30 days')
    )
    ORDER BY agg.visibility_score DESC, agg.total_saves DESC
    LIMIT ${lim};
  `;

  const domainList = candidateRows
    .map(r => normalizeCleanDomain(r.domain))
    .filter(Boolean);

  if (domainList.length === 0) {
    const stats = await getDatabaseEnrichmentStats(sql);
    return {
      batch_size: 0,
      enriched: 0,
      resolved: 0,
      failed: 0,
      results: [],
      stats,
      is_complete: true
    };
  }

  const results = [];
  for (let i = 0; i < domainList.length; i += conc) {
    const slice = domainList.slice(i, i + conc);
    const chunkPromises = slice.map(async (dom) => {
      try {
        return await fetchAndCacheDomainAge(sql, dom, { forceRefresh });
      } catch (_) {
        return { domain: dom, lookup_status: 'failed', age_years: null };
      }
    });
    const batchOutputs = await Promise.all(chunkPromises);
    results.push(...batchOutputs.filter(Boolean));
    if (i + conc < domainList.length) {
      await sleep(randomJitterMs(250, 500));
    }
  }

  const resolved = results.filter(r => r.lookup_status === 'resolved').length;
  const failed = results.filter(r => r.lookup_status === 'failed').length;
  const stats = await getDatabaseEnrichmentStats(sql);

  return {
    batch_size: domainList.length,
    enriched: results.length,
    resolved,
    failed,
    results,
    stats,
    is_complete: stats.unchecked_domains === 0
  };
}

/**
 * Top-Level Executive KPIs + Paginated Domain Leaderboard
 */
export async function listDomainsIntelligence(sql, {
  search = '',
  folderId = null,
  keywordId = null,
  pillar = 'all',           // 'all' | 'serp' | 'archive' | 'competitors'
  preset = 'all',           // 'all' | 'baby_giants' | 'easy_arbitrage' | 'bleeding_giants' | 'high_multipliers' | 'multi_account'
  adNetwork = 'all',        // 'all' | 'raptive' | 'mediavine' | 'journey' | 'ezoic' | 'adsense' | 'affiliate_only' | 'switched' | 'unchecked'
  excludeMarketplaces = true,
  minPins = 1,
  sortBy = 'visibility',    // 'visibility' | 'pins_count' | 'avg_rank' | 'saves' | 'velocity' | 'age_asc' | 'arbitrage_score' | 'multiplier'
  page = 1,
  limit = 50
} = {}) {
  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;
  const minP = Math.max(1, parseInt(minPins, 10) || 1);
  const pNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const off = (pNum - 1) * lim;
  const searchPattern = search ? `%${escapeSqlLike(search)}%` : null;
  const includeArchiveAndComp = (fId === null && kId === null);

  const rows = await sql`
    WITH raw_occurrences AS (
      -- Pillar 2: Keyword SERP Radar
      SELECT
        LOWER(REGEXP_REPLACE(ksc.domain, '^www\\.', '')) AS clean_domain,
        ksc.pin_id,
        ksc.keyword_id,
        CASE WHEN ksc.is_displaced = FALSE THEN ksc.rank_position ELSE NULL END AS active_rank,
        ksc.is_displaced,
        COALESCE(ksc.save_count, 0)::bigint AS saves,
        COALESCE(ksc.repin_count, 0)::bigint AS repins,
        COALESCE(ksc.daily_save_velocity, 0)::numeric AS velocity,
        LOWER(REPLACE(COALESCE(ksc.creator_username, ''), '@', '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(ksc.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug
      FROM keyword_serp_current ksc
      WHERE (${pillar} IN ('all', 'serp'))
        AND ksc.domain IS NOT NULL AND ksc.domain <> ''
        AND (${fId}::int IS NULL OR ksc.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksc.keyword_id = ${kId})

      UNION ALL

      -- Pillar 4: PinArchive Winning Pins
      SELECT
        LOWER(REGEXP_REPLACE(pa.domain, '^www\\.', '')) AS clean_domain,
        pa.pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        FALSE AS is_displaced,
        COALESCE(pa.saves, 0)::bigint AS saves,
        COALESCE(pa.repins, 0)::bigint AS repins,
        COALESCE(pa.velocity, 0)::numeric AS velocity,
        LOWER(REPLACE(COALESCE(pa.account_username, ''), '@', '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pa.link, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug
      FROM pa_pins pa
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'archive'))
        AND pa.domain IS NOT NULL AND pa.domain <> ''

      UNION ALL

      -- Pillar 1: Competitor Catalog Pins
      SELECT
        LOWER(REGEXP_REPLACE(cp.link_domain, '^www\\.', '')) AS clean_domain,
        cp.pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        FALSE AS is_displaced,
        COALESCE(cp.save_count, 0)::bigint AS saves,
        COALESCE(cp.repin_count, 0)::bigint AS repins,
        0::numeric AS velocity,
        LOWER(COALESCE(prof.username, '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(cp.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug
      FROM competitor_pins cp
      LEFT JOIN competitor_profiles prof ON prof.id = cp.competitor_id
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'competitors'))
        AND cp.link_domain IS NOT NULL AND cp.link_domain <> ''
    ),
    deduped_pins AS (
      SELECT
        clean_domain,
        pin_id,
        MIN(active_rank) AS best_serp_rank,
        COUNT(DISTINCT keyword_id) FILTER (WHERE active_rank IS NOT NULL)::int AS ranked_keywords_for_pin,
        BOOL_OR(is_displaced) AND MIN(active_rank) IS NULL AS is_displaced_only,
        MAX(saves)::bigint AS saves,
        MAX(repins)::bigint AS repins,
        MAX(velocity)::numeric AS velocity,
        MAX(NULLIF(username, '')) AS username,
        MAX(NULLIF(url_slug, '')) AS url_slug
      FROM raw_occurrences
      WHERE clean_domain <> ''
        AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
        AND (${excludeMarketplaces} = FALSE OR clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[]))
        AND (${searchPattern}::text IS NULL OR clean_domain LIKE ${searchPattern})
      GROUP BY clean_domain, pin_id
    ),
    domain_agg AS (
      SELECT
        dp.clean_domain AS domain,
        COUNT(DISTINCT dp.pin_id)::int AS total_pins,
        GREATEST(1, COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/'))::int AS unique_urls,
        ROUND(
          COUNT(DISTINCT dp.pin_id)::numeric /
          GREATEST(1, COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')),
          2
        ) AS pins_per_url,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank IS NOT NULL)::int AS active_serp_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3)::int AS top3_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 10)::int AS top10_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50)::int AS rank_11_50_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_displaced_only = TRUE)::int AS displaced_pins,
        MIN(dp.best_serp_rank)::int AS best_rank,
        ROUND(AVG(dp.best_serp_rank), 1) AS avg_rank,
        ROUND(
          SUM(CASE WHEN dp.best_serp_rank IS NOT NULL THEN (101 - LEAST(100, dp.best_serp_rank)) / 100.0 ELSE 0 END)::numeric,
          2
        ) AS visibility_score,
        SUM(dp.saves)::bigint AS total_saves,
        ROUND(AVG(dp.saves))::bigint AS avg_saves,
        SUM(dp.repins)::bigint AS total_repins,
        ROUND(AVG(dp.velocity), 2) AS avg_velocity,
        COUNT(DISTINCT dp.username) FILTER (WHERE dp.username IS NOT NULL)::int AS accounts_count,
        (ARRAY_AGG(DISTINCT dp.username) FILTER (WHERE dp.username IS NOT NULL))[1:5] AS sample_accounts
      FROM deduped_pins dp
      GROUP BY dp.clean_domain
      HAVING COUNT(DISTINCT dp.pin_id) >= ${minP}
    ),
    enriched AS (
      SELECT
        da.*,
        drm.registered_at AS domain_created_at,
        drm.expires_at AS domain_expires_at,
        drm.lookup_status AS age_status,
        CASE
          WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 86400))::int
          ELSE drm.initial_age_days
        END AS age_days,
        CASE
          WHEN drm.registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 31557600)::numeric, 2)
          ELSE drm.initial_age_years
        END AS age_years,
        COALESCE(dmm.current_ad_network, 'unchecked') AS ad_network,
        dmm.ad_manager_domain,
        dmm.primary_pub_id,
        dmm.previous_ad_network,
        dmm.switched_at AS ad_switched_at,
        dmm.network_history AS ad_network_history,
        COALESCE(dmm.ads_txt_status, 'pending') AS ads_txt_status,
        ROUND(
          (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) * 100,
          1
        ) AS decay_rate_pct,
        ROUND(
          (
            (GREATEST(0.5, da.visibility_score) * LN(GREATEST(10, da.total_saves)::numeric)) /
            GREATEST(
              0.25,
              COALESCE(
                CASE WHEN drm.registered_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 31557600)::numeric ELSE NULL END,
                drm.initial_age_years,
                2.5
              )
            )
          )::numeric,
          2
        ) AS arbitrage_score
      FROM domain_agg da
      LEFT JOIN domain_registry_metadata drm ON drm.domain = da.domain
      LEFT JOIN domain_monetization_metadata dmm ON dmm.domain = da.domain
      WHERE (
        ${preset} = 'all'
        OR (${preset} = 'baby_giants' AND drm.registered_at >= NOW() - INTERVAL '2 years' AND (da.top10_pins >= 1 OR da.total_saves >= 1000))
        OR (${preset} = 'easy_arbitrage' AND da.total_pins <= 25 AND (da.top10_pins >= 1 OR da.avg_velocity >= 5))
        OR (${preset} = 'bleeding_giants' AND da.displaced_pins >= 3 AND (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.30)
        OR (${preset} = 'high_multipliers' AND da.pins_per_url >= 3.0)
        OR (${preset} = 'multi_account' AND da.accounts_count >= 2)
      )
      AND (
        ${adNetwork} = 'all'
        OR (${adNetwork} = 'switched' AND dmm.switched_at IS NOT NULL)
        OR (${adNetwork} = 'unchecked' AND (dmm.current_ad_network IS NULL OR dmm.current_ad_network = 'unchecked'))
        OR dmm.current_ad_network = ${adNetwork}
      )
    )
    SELECT
      *,
      COUNT(*) OVER()::int AS total_filtered_domains,
      SUM(top10_pins) OVER()::int AS global_top10_slots,
      COUNT(*) FILTER (WHERE age_years IS NOT NULL AND age_years <= 2.0 AND (top10_pins >= 1 OR total_saves >= 1000)) OVER()::int AS baby_giants_count,
      COUNT(*) FILTER (WHERE accounts_count >= 2) OVER()::int AS multi_account_domains_count,
      ROUND(AVG(pins_per_url) OVER(), 2) AS global_avg_multiplier
    FROM enriched
    ORDER BY
      CASE WHEN ${sortBy} = 'visibility' THEN visibility_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'pins_count' THEN total_pins END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'avg_rank' THEN avg_rank END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'saves' THEN total_saves END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'velocity' THEN avg_velocity END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'age_asc' THEN age_days END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'arbitrage_score' THEN arbitrage_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'multiplier' THEN pins_per_url END DESC NULLS LAST,
      visibility_score DESC, total_saves DESC
    LIMIT ${lim} OFFSET ${off};
  `;

  const total = rows[0]?.total_filtered_domains || 0;
  const globalTop10 = Math.max(1, rows[0]?.global_top10_slots || 1);
  const top5Share = rows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
  const top5MonopolyPct = Number(Math.min(100, (top5Share / globalTop10) * 100).toFixed(1));

  const missingAgeDomains = rows
    .filter(r => !r.age_status && r.domain)
    .map(r => r.domain)
    .slice(0, 8);

  return {
    overview: {
      total_domains: total,
      top5_monopoly_pct: top5MonopolyPct,
      baby_giants_count: rows[0]?.baby_giants_count || 0,
      multi_account_count: rows[0]?.multi_account_domains_count || 0,
      avg_pins_per_url: Number(rows[0]?.global_avg_multiplier || 1.0)
    },
    domains: rows.map(r => ({
      domain: r.domain,
      total_pins: Number(r.total_pins || 0),
      unique_urls: Number(r.unique_urls || 1),
      pins_per_url: Number(r.pins_per_url || 1),
      active_serp_pins: Number(r.active_serp_pins || 0),
      top3_pins: Number(r.top3_pins || 0),
      top10_pins: Number(r.top10_pins || 0),
      rank_11_50_pins: Number(r.rank_11_50_pins || 0),
      displaced_pins: Number(r.displaced_pins || 0),
      best_rank: r.best_rank != null ? Number(r.best_rank) : null,
      avg_rank: r.avg_rank != null ? Number(r.avg_rank) : null,
      visibility_score: Number(r.visibility_score || 0),
      total_saves: Number(r.total_saves || 0),
      avg_saves: Number(r.avg_saves || 0),
      total_repins: Number(r.total_repins || 0),
      avg_velocity: Number(r.avg_velocity || 0),
      accounts_count: Number(r.accounts_count || 0),
      sample_accounts: Array.isArray(r.sample_accounts) ? r.sample_accounts : [],
      domain_created_at: r.domain_created_at || null,
      domain_expires_at: r.domain_expires_at || null,
      age_days: r.age_days != null ? Number(r.age_days) : null,
      age_years: r.age_years != null ? Number(r.age_years) : null,
      age_status: r.age_status || 'unchecked',
      ad_network: r.ad_network || 'unchecked',
      ad_manager_domain: r.ad_manager_domain || null,
      primary_pub_id: r.primary_pub_id || null,
      previous_ad_network: r.previous_ad_network || null,
      ad_switched_at: r.ad_switched_at || null,
      ad_network_history: Array.isArray(r.ad_network_history) ? r.ad_network_history : [],
      ads_txt_status: r.ads_txt_status || 'pending',
      decay_rate_pct: Number(r.decay_rate_pct || 0),
      arbitrage_score: Number(r.arbitrage_score || 0)
    })),
    missing_age_domains: missingAgeDomains,
    missing_ad_domains: rows
      .filter(r => (!r.ad_network || r.ad_network === 'unchecked') && r.domain)
      .map(r => r.domain)
      .slice(0, 10),
    page: pNum,
    limit: lim,
    total,
    total_pages: Math.max(1, Math.ceil(total / lim))
  };
}

/**
 * Deep Dossier for a Specific Domain:
 * 1. Live WHOIS / Age check via fetchAndCacheDomainAge
 * 2. All Ranked Pins & SERP Positions across Keywords
 * 3. Top Money URLs (Grouped by article slug with all creative pin variations)
 * 4. Keyword Monopoly Matrix (Keywords where this domain holds multiple slots)
 * 5. Associated Pinterest Creator Accounts
 */
export async function getDomainDeepDossier(sql, rawDomain, { folderId = null, keywordId = null } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) throw new Error('Valid domain is required.');

  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;

  const [ageInfo, adInfo, serpPins, archivePins, compPins] = await Promise.all([
    fetchAndCacheDomainAge(sql, cleanDomain),
    fetchAndCacheDomainAdNetwork(sql, cleanDomain).catch(() => null),
    sql`
      SELECT
        ksc.pin_id,
        ksc.keyword_id,
        tk.keyword AS keyword_name,
        ksc.rank_position,
        ksc.last_known_rank,
        ksc.is_displaced,
        ksc.displaced_date,
        ksc.title,
        ksc.destination_url,
        ksc.image_url,
        ksc.creator_username,
        ksc.board_name,
        COALESCE(ksc.save_count, 0)::bigint AS saves,
        COALESCE(ksc.repin_count, 0)::bigint AS repins,
        COALESCE(ksc.daily_save_velocity, 0)::numeric AS velocity,
        ksc.dominant_color,
        ksc.visual_annotations,
        ksc.created_at_pinterest
      FROM keyword_serp_current ksc
      LEFT JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
      WHERE LOWER(REGEXP_REPLACE(ksc.domain, '^www\\.', '')) = ${cleanDomain}
        AND (${fId}::int IS NULL OR ksc.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksc.keyword_id = ${kId})
      ORDER BY ksc.is_displaced ASC, ksc.rank_position ASC NULLS LAST, ksc.save_count DESC
      LIMIT 300;
    `.catch(() => []),
    sql`
      SELECT
        pa.pin_id,
        pa.title,
        pa.link AS destination_url,
        pa.image_url,
        pa.account_username AS creator_username,
        pa.board_name,
        COALESCE(pa.saves, 0)::bigint AS saves,
        COALESCE(pa.repins, 0)::bigint AS repins,
        COALESCE(pa.velocity, 0)::numeric AS velocity,
        pa.dominant_color,
        pa.annotations AS visual_annotations,
        pa.created_at_pinterest
      FROM pa_pins pa
      WHERE LOWER(REGEXP_REPLACE(pa.domain, '^www\\.', '')) = ${cleanDomain}
      ORDER BY pa.saves DESC
      LIMIT 200;
    `.catch(() => []),
    sql`
      SELECT
        cp.pin_id,
        cp.title,
        cp.destination_url,
        cp.image_url,
        prof.username AS creator_username,
        cp.board_name,
        COALESCE(cp.save_count, 0)::bigint AS saves,
        COALESCE(cp.repin_count, 0)::bigint AS repins,
        cp.created_at_pinterest
      FROM competitor_pins cp
      LEFT JOIN competitor_profiles prof ON prof.id = cp.competitor_id
      WHERE LOWER(REGEXP_REPLACE(cp.link_domain, '^www\\.', '')) = ${cleanDomain}
      ORDER BY cp.save_count DESC
      LIMIT 200;
    `.catch(() => [])
  ]);

  // 1. Consolidate Unique Pins with their SERP Rank Appearances
  const pinsMap = new Map();
  const keywordMatrixMap = new Map();
  const accountsMap = new Map();

  const registerPin = (row, sourcePillar) => {
    const pid = String(row.pin_id || '').trim();
    if (!pid) return;
    const cleanUser = String(row.creator_username || '').replace(/^@+/, '').trim().toLowerCase();
    if (cleanUser) {
      if (!accountsMap.has(cleanUser)) {
        accountsMap.set(cleanUser, { username: cleanUser, pins_count: 0, total_saves: 0, top10_count: 0 });
      }
    }

    if (!pinsMap.has(pid)) {
      let cleanSlug = '/';
      if (row.destination_url) {
        try {
          const u = new URL(row.destination_url.startsWith('http') ? row.destination_url : `https://${row.destination_url}`);
          cleanSlug = u.pathname.replace(/\/+$/, '') || '/';
        } catch (_) {}
      }
      pinsMap.set(pid, {
        pin_id: pid,
        title: row.title || `Pin #${pid}`,
        destination_url: row.destination_url || '',
        clean_slug: cleanSlug.toLowerCase(),
        image_url: row.image_url || '',
        creator_username: cleanUser,
        board_name: row.board_name || '',
        saves: Number(row.saves || 0),
        repins: Number(row.repins || 0),
        velocity: Number(row.velocity || 0),
        created_at_pinterest: row.created_at_pinterest || null,
        best_rank: null,
        is_displaced: false,
        serp_appearances: [],
        pillars: new Set([sourcePillar])
      });
    } else {
      const existing = pinsMap.get(pid);
      existing.saves = Math.max(existing.saves, Number(row.saves || 0));
      existing.repins = Math.max(existing.repins, Number(row.repins || 0));
      existing.velocity = Math.max(existing.velocity, Number(row.velocity || 0));
      if (!existing.title && row.title) existing.title = row.title;
      if (!existing.image_url && row.image_url) existing.image_url = row.image_url;
      if (!existing.creator_username && cleanUser) existing.creator_username = cleanUser;
      if ((!existing.destination_url || existing.clean_slug === '/') && row.destination_url) {
        existing.destination_url = row.destination_url;
        try {
          const u = new URL(row.destination_url.startsWith('http') ? row.destination_url : `https://${row.destination_url}`);
          existing.clean_slug = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
        } catch (_) {}
      }
      existing.pillars.add(sourcePillar);
    }

    if (sourcePillar === 'serp' && row.keyword_id) {
      const pEntry = pinsMap.get(pid);
      const activeRank = !row.is_displaced && row.rank_position ? Number(row.rank_position) : null;
      if (activeRank !== null && (pEntry.best_rank === null || activeRank < pEntry.best_rank)) {
        pEntry.best_rank = activeRank;
      }
      if (row.is_displaced && pEntry.best_rank === null) {
        pEntry.is_displaced = true;
      }
      pEntry.serp_appearances.push({
        keyword_id: Number(row.keyword_id),
        keyword_name: row.keyword_name || `Keyword #${row.keyword_id}`,
        rank_position: activeRank,
        last_known_rank: row.last_known_rank ? Number(row.last_known_rank) : null,
        is_displaced: Boolean(row.is_displaced)
      });

      const kwKey = Number(row.keyword_id);
      if (!keywordMatrixMap.has(kwKey)) {
        keywordMatrixMap.set(kwKey, {
          keyword_id: kwKey,
          keyword_name: row.keyword_name || `Keyword #${kwKey}`,
          active_slots: 0,
          displaced_slots: 0,
          best_rank: null,
          ranks: [],
          total_saves: 0
        });
      }
      const kwEntry = keywordMatrixMap.get(kwKey);
      kwEntry.total_saves += Number(row.saves || 0);
      if (activeRank !== null) {
        kwEntry.active_slots++;
        kwEntry.ranks.push(activeRank);
        if (kwEntry.best_rank === null || activeRank < kwEntry.best_rank) {
          kwEntry.best_rank = activeRank;
        }
      } else {
        kwEntry.displaced_slots++;
      }
    }
  };

  for (const r of serpPins) registerPin(r, 'serp');
  if (!fId && !kId) {
    for (const r of archivePins) registerPin(r, 'archive');
    for (const r of compPins) registerPin(r, 'competitors');
  }

  // 2. Finalize Pins & Group by Money Article URLs
  const urlGroupsMap = new Map();
  const allPins = Array.from(pinsMap.values()).map(p => {
    if (p.creator_username && accountsMap.has(p.creator_username)) {
      const acc = accountsMap.get(p.creator_username);
      acc.pins_count++;
      acc.total_saves += p.saves;
      if (p.best_rank !== null && p.best_rank <= 10) acc.top10_count++;
    }

    const slugKey = p.clean_slug || '/';
    if (!urlGroupsMap.has(slugKey)) {
      urlGroupsMap.set(slugKey, {
        clean_slug: slugKey,
        sample_url: p.destination_url || `https://${cleanDomain}${slugKey}`,
        pins_count: 0,
        total_saves: 0,
        total_repins: 0,
        best_rank: null,
        keywords_set: new Set(),
        pins: []
      });
    }
    const uGroup = urlGroupsMap.get(slugKey);
    uGroup.pins_count++;
    uGroup.total_saves += p.saves;
    uGroup.total_repins += p.repins;
    if (p.best_rank !== null && (uGroup.best_rank === null || p.best_rank < uGroup.best_rank)) {
      uGroup.best_rank = p.best_rank;
    }
    for (const sa of p.serp_appearances) {
      if (sa.keyword_name) uGroup.keywords_set.add(sa.keyword_name);
    }
    uGroup.pins.push({
      pin_id: p.pin_id,
      title: p.title,
      image_url: p.image_url,
      saves: p.saves,
      velocity: p.velocity,
      best_rank: p.best_rank,
      creator_username: p.creator_username
    });

    return {
      ...p,
      pillars: Array.from(p.pillars)
    };
  });

  allPins.sort((a, b) => {
    if (a.best_rank !== null && b.best_rank !== null) return a.best_rank - b.best_rank;
    if (a.best_rank !== null) return -1;
    if (b.best_rank !== null) return 1;
    return b.saves - a.saves;
  });

  const moneyUrls = Array.from(urlGroupsMap.values())
    .map(u => ({
      clean_slug: u.clean_slug,
      sample_url: u.sample_url,
      pins_count: u.pins_count,
      total_saves: u.total_saves,
      total_repins: u.total_repins,
      best_rank: u.best_rank,
      keywords: Array.from(u.keywords_set),
      pins: u.pins.sort((a, b) => b.saves - a.saves)
    }))
    .sort((a, b) => b.pins_count - a.pins_count || b.total_saves - a.total_saves);

  const keywordMonopoly = Array.from(keywordMatrixMap.values())
    .map(k => ({
      ...k,
      ranks: k.ranks.sort((a, b) => a - b)
    }))
    .sort((a, b) => b.active_slots - a.active_slots || (a.best_rank || 999) - (b.best_rank || 999));

  return {
    success: true,
    domain: cleanDomain,
    age_info: ageInfo,
    ad_info: adInfo,
    summary: {
      total_pins: allPins.length,
      unique_urls: moneyUrls.length,
      pins_per_url: moneyUrls.length > 0 ? Number((allPins.length / moneyUrls.length).toFixed(2)) : 1,
      ranked_keywords_count: keywordMonopoly.length,
      total_saves: allPins.reduce((acc, p) => acc + p.saves, 0),
      accounts_count: accountsMap.size
    },
    ranked_pins: allPins,
    money_urls: moneyUrls,
    keyword_monopoly: keywordMonopoly,
    accounts: Array.from(accountsMap.values()).sort((a, b) => b.total_saves - a.total_saves)
  };
}
