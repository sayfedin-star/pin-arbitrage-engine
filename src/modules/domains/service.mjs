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
import { hydrateDisplacedIndexFromShards } from '../keywords/service.mjs';
import {
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch,
  normalizeMonetizationRecord,
  parseAdsTxtMonetization,
  KNOWN_AD_NETWORKS,
  AD_NETWORK_DISPLAY_CONFIG
} from './ad-network-service.mjs';

export {
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch,
  normalizeMonetizationRecord,
  parseAdsTxtMonetization,
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
    const netPkg = ['node:', 'net'].join('');
    const net = await import(/* webpackIgnore: true */ netPkg).catch(() => null);
    if (!net || typeof net.createConnection !== 'function') return null;
    let StringDecoder = null;
    try {
      const sd = await import('node:string_decoder');
      StringDecoder = sd.StringDecoder;
    } catch (_) {}

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
    const MAX_BUFFER_BYTES = 64 * 1024; // 64KB protection ceiling

    return await new Promise((resolve) => {
      let resolved = false;
      let timer = null;
      let socket = null;
      const decoder = StringDecoder ? new StringDecoder('utf8') : null;
      let buffer = '';

      const done = (result) => {
        if (resolved) return;
        resolved = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (socket) {
          try {
            socket.removeAllListeners();
            socket.destroy();
          } catch (_) {}
          socket = null;
        }
        resolve(result);
      };

      timer = setTimeout(() => {
        done(buffer || null);
      }, 3500);
      if (typeof timer.unref === 'function') timer.unref();

      try {
        socket = net.createConnection(43, host, () => {
          socket.write(`${cleanDomain}\r\n`);
        });

        socket.on('data', chunk => {
          if (buffer.length < MAX_BUFFER_BYTES) {
            buffer += decoder ? decoder.write(chunk) : chunk.toString('utf8');
            if (buffer.length >= MAX_BUFFER_BYTES) {
              done(buffer.slice(0, MAX_BUFFER_BYTES));
            }
          }
        });

        socket.on('end', () => {
          if (decoder) buffer += decoder.end();
          done(buffer || null);
        });

        socket.on('error', () => {
          done(null);
        });
      } catch (_) {
        done(null);
      }
    });
  } catch (_) {
    return null;
  }
}

/**
 * Edge-compatible HTTPS RDAP Domain Age & Registrar Lookup
 * Uses standard fetch with https://rdap.org/domain/<domain>
 * Fully operational in Cloudflare Workers and Node.js without raw TCP sockets.
 */
export async function queryWhoisHttpsRdap(cleanDomain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(cleanDomain)}`, {
      headers: {
        'Accept': 'application/rdap+json, application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      return null;
    }
    const data = await res.json();
    if (!data) return null;

    let createdAt = null;
    let updatedAt = null;
    let expiresAt = null;

    if (Array.isArray(data.events)) {
      const regEvent = data.events.find(e => e.eventAction === 'registration' || e.eventAction === 'created');
      const updEvent = data.events.find(e => e.eventAction === 'last changed' || e.eventAction === 'last update');
      const expEvent = data.events.find(e => e.eventAction === 'expiration');
      if (regEvent?.eventDate) createdAt = regEvent.eventDate;
      if (updEvent?.eventDate) updatedAt = updEvent.eventDate;
      if (expEvent?.eventDate) expiresAt = expEvent.eventDate;
    }

    return {
      createdAt,
      updatedAt,
      expiresAt,
      raw: data
    };
  } catch (_) {
    return null;
  }
}

/**
 * Fetch-Once Domain Age & WHOIS Registration Resolver
 * Primary: https://api.domainee.dev/v1/tools/domain-age-checker?domain=http://<domain>/
 * Fallback: https://rdap.org/domain/<domain>
 */
export async function fetchAndCacheDomainAge(sql, rawDomain, { forceRefresh = false, fastPath = false } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) return null;

  if (!forceRefresh) {
    try {
      const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
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
            WHEN registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - registered_at)) / 86400))::int
            ELSE initial_age_days
          END AS age_days,
          CASE
            WHEN registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - registered_at)) / 31557600)::numeric, 2)
            ELSE initial_age_years
          END AS age_years
        FROM domain_registry_metadata
        WHERE domain = ${cleanDomain}
          AND (
            lookup_status = 'resolved'
            OR (lookup_status = 'failed' AND checked_at > ${referenceTime}::timestamptz - INTERVAL '3 days')
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

  // [INVARIANT: FAST-PATH-NON-BLOCKING] Uncached domains return immediately with pending status
  if (fastPath) {
    return {
      domain: cleanDomain,
      registered_at: null,
      updated_at_whois: null,
      expires_at: null,
      lookup_source: null,
      lookup_status: 'pending',
      checked_at: null,
      age_days: null,
      age_years: null,
      needs_enrichment: true
    };
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

  // Tier 2: Direct Socket WHOIS or HTTPS RDAP for ccTLDs (.me, .co, .io, .ai, etc.)
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
      if (!created) {
        const rdap = await queryWhoisHttpsRdap(cleanDomain);
        if (rdap?.createdAt) {
          const parsed = new Date(rdap.createdAt);
          if (!isNaN(parsed.getTime())) {
            created = parsed.toISOString();
            updated = (rdap.updatedAt && !isNaN(new Date(rdap.updatedAt).getTime())) ? new Date(rdap.updatedAt).toISOString() : null;
            expires = (rdap.expiresAt && !isNaN(new Date(rdap.expiresAt).getTime())) ? new Date(rdap.expiresAt).toISOString() : null;
            source = 'https_rdap';
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
    if (saved) {
      // [INVARIANT: SYNC-ENRICHMENT-ROLLUP-AGE] Sync WHOIS age directly into domain_intelligence_rollup
      const resolvedAgeDays = saved.age_days != null ? Number(saved.age_days) : null;
      const resolvedAgeYears = saved.age_years != null ? Number(saved.age_years) : null;
      sql`
        UPDATE domain_intelligence_rollup
        SET domain_created_at = ${saved.registered_at ? new Date(saved.registered_at) : null},
            domain_expires_at = ${saved.expires_at ? new Date(saved.expires_at) : null},
            age_days = ${resolvedAgeDays},
            age_years = ${resolvedAgeYears},
            age_status = ${saved.lookup_status || status},
            refreshed_at = NOW()
        WHERE domain = ${cleanDomain};
      `.catch(() => {});
    }

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
    // [INVARIANT: FAST-ENRICHMENT-STATS-ROLLUP] Query domain_intelligence_rollup first for instant O(1) stats
    const [rollupStats] = await sql`
      SELECT
        COUNT(*)::int AS total_domains,
        COUNT(*) FILTER (WHERE age_status IN ('resolved', 'failed') OR age_days IS NOT NULL)::int AS checked_domains,
        COUNT(*) FILTER (WHERE age_status = 'resolved' OR (age_status <> 'failed' AND age_days IS NOT NULL))::int AS resolved_domains,
        COUNT(*) FILTER (WHERE age_status = 'failed')::int AS failed_domains,
        (COUNT(*) - COUNT(*) FILTER (WHERE age_status IN ('resolved', 'failed') OR age_days IS NOT NULL))::int AS unchecked_domains,
        ROUND((COUNT(*) FILTER (WHERE age_status IN ('resolved', 'failed') OR age_days IS NOT NULL)::numeric / GREATEST(1, COUNT(*))) * 100, 1) AS percent_complete
      FROM domain_intelligence_rollup;
    `.catch(() => []);

    if (rollupStats && Number(rollupStats.total_domains) > 0) {
      return {
        total_domains: Number(rollupStats.total_domains || 0),
        checked_domains: Number(rollupStats.checked_domains || 0),
        resolved_domains: Number(rollupStats.resolved_domains || 0),
        failed_domains: Number(rollupStats.failed_domains || 0),
        unchecked_domains: Number(rollupStats.unchecked_domains || 0),
        percent_complete: Number(rollupStats.percent_complete || 0)
      };
    }

    const [stats] = await sql`
      WITH all_domains AS (
        SELECT DISTINCT domain AS clean_domain
        FROM keyword_serp_current
        WHERE domain IS NOT NULL AND domain <> ''
        UNION
        SELECT DISTINCT domain AS clean_domain
        FROM pa_pins
        WHERE domain IS NOT NULL AND domain <> ''
        UNION
        SELECT DISTINCT cp.link_domain AS clean_domain
        FROM competitor_pins cp
        WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
        UNION
        SELECT DISTINCT kdi.domain AS clean_domain
        FROM keyword_displaced_index kdi
        WHERE kdi.domain IS NOT NULL AND kdi.domain <> ''
        UNION
        SELECT DISTINCT domain AS clean_domain
        FROM domain_registry_metadata
        WHERE domain IS NOT NULL AND domain <> ''
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
        ksc.domain AS clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(ksc.rank_position, 50))))::bigint AS visibility_score,
        SUM(COALESCE(ksc.save_count, 0))::bigint AS total_saves
      FROM keyword_serp_current ksc
      WHERE ksc.domain IS NOT NULL AND ksc.domain <> ''
      GROUP BY ksc.domain

      UNION ALL

      SELECT
        pa.domain AS clean_domain,
        0::bigint AS visibility_score,
        SUM(COALESCE(pa.saves, 0))::bigint AS total_saves
      FROM pa_pins pa
      WHERE pa.domain IS NOT NULL AND pa.domain <> ''
      GROUP BY pa.domain

      UNION ALL

      SELECT
        cp.link_domain AS clean_domain,
        0::bigint AS visibility_score,
        SUM(COALESCE(cp.save_count, 0))::bigint AS total_saves
      FROM competitor_pins cp
      WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
      GROUP BY cp.link_domain

      UNION ALL

      SELECT
        kdi.domain AS clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(kdi.last_known_rank, 50))))::bigint AS visibility_score,
        SUM(COALESCE(kdi.save_count, 0))::bigint AS total_saves
      FROM keyword_displaced_index kdi
      WHERE kdi.domain IS NOT NULL AND kdi.domain <> ''
      GROUP BY kdi.domain
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
  ageFilter = 'all',        // 'all' | 'le_0_5' | 'le_1' | 'le_2' | 'le_3' | 'le_5' | 'gt_5' | 'verified' | 'unchecked'
  rankFilter = 'all',       // 'all' | 'top3' | 'top5' | 'top10' | 'top20' | 'top50' | 'displaced' | 'bleeding'
  savesFilter = 'all',      // 'all' | 'ge_500' | 'ge_1k' | 'ge_5k' | 'ge_10k' | 'ge_50k' | 'ge_100k' | 'ge_500k' | 'vel_5' | 'vel_20'
  sizeFilter = 'all',       // 'all' | 'pins_le_25' | 'pins_le_100' | 'pins_ge_100' | 'pins_ge_500' | 'mult_ge_2' | 'mult_ge_3' | 'mult_ge_5' | 'multi_acct' | 'pbn_3'
  logicMode = 'and',        // 'and' | 'or'
  excludeMarketplaces = true,
  minPins = 1,
  sortBy = 'visibility',    // 'visibility' | 'pins_count' | 'avg_rank' | 'saves' | 'velocity' | 'age_asc' | 'age_desc' | 'arbitrage_score' | 'multiplier'
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
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();

  const rows = await sql`
    WITH raw_occurrences AS (
      -- Pillar 2: Keyword SERP Radar
      SELECT
        ksc.domain AS clean_domain,
        ksc.pin_id,
        ksc.keyword_id,
        CASE WHEN ksc.is_displaced = FALSE THEN ksc.rank_position ELSE NULL END AS active_rank,
        ksc.is_displaced,
        COALESCE(ksc.save_count, 0)::bigint AS saves,
        COALESCE(ksc.repin_count, 0)::bigint AS repins,
        COALESCE(ksc.daily_save_velocity, 0)::numeric AS velocity,
        LOWER(REPLACE(COALESCE(ksc.creator_username, ''), '@', '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(ksc.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
        TRUE AS is_serp_ranked
      FROM keyword_serp_current ksc
      WHERE (${pillar} IN ('all', 'serp', 'competitors'))
        AND ksc.domain IS NOT NULL AND ksc.domain <> ''
        AND (${fId}::int IS NULL OR ksc.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksc.keyword_id = ${kId})

      UNION ALL

      -- Pillar 4: PinArchive Winning Pins
      SELECT
        pa.domain AS clean_domain,
        pa.pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        FALSE AS is_displaced,
        COALESCE(pa.saves, 0)::bigint AS saves,
        COALESCE(pa.repins, 0)::bigint AS repins,
        COALESCE(pa.velocity, 0)::numeric AS velocity,
        LOWER(REPLACE(COALESCE(pa.account_username, ''), '@', '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pa.link, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
        FALSE AS is_serp_ranked
      FROM pa_pins pa
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'archive'))
        AND pa.domain IS NOT NULL AND pa.domain <> ''

      UNION ALL

      -- Pillar 1: Competitor Catalog Pins (Used exclusively for account association & discovery, not for inflating ranked pin volume)
      SELECT
        cp.link_domain AS clean_domain,
        cp.pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        FALSE AS is_displaced,
        COALESCE(cp.save_count, 0)::bigint AS saves,
        COALESCE(cp.repin_count, 0)::bigint AS repins,
        0::numeric AS velocity,
        LOWER(COALESCE(prof.username, '')) AS username,
        COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(cp.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
        FALSE AS is_serp_ranked
      FROM competitor_pins cp
      LEFT JOIN competitor_profiles prof ON prof.id = cp.competitor_id
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'competitors'))
        AND cp.link_domain IS NOT NULL AND cp.link_domain <> ''

      UNION ALL

      -- Displaced Pillar: keyword_displaced_index
      SELECT
        kdi.domain AS clean_domain,
        kdi.pin_id,
        kdi.keyword_id,
        kdi.last_known_rank AS active_rank,
        TRUE AS is_displaced,
        COALESCE(kdi.save_count, 0)::bigint AS saves,
        COALESCE(kdi.repin_count, 0)::bigint AS repins,
        COALESCE(kdi.daily_save_velocity, 0)::numeric AS velocity,
        '' AS username,
        '/' AS url_slug,
        TRUE AS is_serp_ranked
      FROM keyword_displaced_index kdi
      WHERE (${pillar} IN ('all', 'serp', 'displaced', 'competitors'))
        AND kdi.domain IS NOT NULL AND kdi.domain <> ''
        AND (${fId}::int IS NULL OR kdi.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR kdi.keyword_id = ${kId})

      UNION ALL

      -- Base Pillar 0: Preserved Domain Registry Metadata (Guarantees all 2,703 discovered domains remain visible with WHOIS & ads.txt)
      SELECT
        drm.domain AS clean_domain,
        'reg_' || drm.domain AS pin_id,
        NULL::int AS keyword_id,
        NULL::int AS active_rank,
        TRUE AS is_displaced,
        0::bigint AS saves,
        0::bigint AS repins,
        0::numeric AS velocity,
        '' AS username,
        '/' AS url_slug,
        FALSE AS is_serp_ranked
      FROM domain_registry_metadata drm
      WHERE ${includeArchiveAndComp} = TRUE
        AND (${pillar} IN ('all', 'serp'))
        AND drm.domain IS NOT NULL AND drm.domain <> ''
    ),
    deduped_pins AS (
      SELECT
        clean_domain,
        pin_id,
        MIN(active_rank) AS best_serp_rank,
        COUNT(DISTINCT keyword_id) FILTER (WHERE active_rank IS NOT NULL)::int AS ranked_keywords_for_pin,
        BOOL_OR(is_displaced) AND MIN(active_rank) IS NULL AS is_displaced_only,
        BOOL_OR(is_serp_ranked) AS is_serp_ranked,
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
        AND (${pillar} <> 'competitors' OR clean_domain IN (
          SELECT link_domain
          FROM competitor_pins
          WHERE link_domain IS NOT NULL AND link_domain <> ''
        ))
      GROUP BY clean_domain, pin_id
    ),
    domain_agg AS (
      SELECT
        dp.clean_domain AS domain,
        -- [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
        -- Prioritize pins that were observed in SERP/Displaced rankings to prevent catalog pin inflation
        COALESCE(
          NULLIF(
            CASE
              WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
              THEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE)
              ELSE COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%'))
            END, 0
          ), 1
        )::int AS total_pins,
        GREATEST(
          1,
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            ELSE COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
          END
        )::int AS unique_urls,
        ROUND(
          COALESCE(
            NULLIF(
              CASE
                WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
                THEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE)
                ELSE COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%'))
              END, 0
            ), 1
          )::numeric /
          GREATEST(
            1,
            CASE
              WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
              THEN COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
              ELSE COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
            END
          ),
          2
        ) AS pins_per_url,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank IS NOT NULL)::int AS active_serp_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3)::int AS top3_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 10)::int AS top10_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50)::int AS rank_11_50_pins,
        COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_displaced_only = TRUE AND NOT (dp.pin_id LIKE 'reg_%'))::int AS displaced_pins,
        MIN(dp.best_serp_rank)::int AS best_rank,
        ROUND(AVG(dp.best_serp_rank), 1) AS avg_rank,
        ROUND(
          (
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank <= 3) * 100) +
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 3 AND dp.best_serp_rank <= 10) * 45) +
            (COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.best_serp_rank > 10 AND dp.best_serp_rank <= 50) * 12)
          )::numeric,
          1
        ) AS visibility_score,
        CASE
          WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
          THEN COALESCE(SUM(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0)::bigint
          ELSE COALESCE(SUM(dp.saves), 0)::bigint
        END AS total_saves,
        CASE
          WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
          THEN ROUND(COALESCE(AVG(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0))::bigint
          ELSE ROUND(COALESCE(AVG(dp.saves), 0))::bigint
        END AS avg_saves,
        CASE
          WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
          THEN COALESCE(SUM(dp.repins) FILTER (WHERE dp.is_serp_ranked = TRUE), 0)::bigint
          ELSE COALESCE(SUM(dp.repins), 0)::bigint
        END AS total_repins,
        CASE
          WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
          THEN ROUND(COALESCE(AVG(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE), 0), 2)
          ELSE ROUND(COALESCE(AVG(dp.velocity), 0), 2)
        END AS avg_velocity,
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
          WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 86400))::int
          ELSE drm.initial_age_days
        END AS age_days,
        CASE
          WHEN drm.registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric, 2)
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
                CASE WHEN drm.registered_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric ELSE NULL END,
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
        OR (${preset} = 'baby_giants' AND drm.registered_at >= ${referenceTime}::timestamptz - INTERVAL '2 years' AND (da.top10_pins >= 1 OR da.total_saves >= 1000))
        OR (${preset} = 'easy_arbitrage' AND da.total_pins <= 25 AND (da.top10_pins >= 1 OR da.avg_velocity >= 5))
        OR (${preset} = 'bleeding_giants' AND da.displaced_pins >= 3 AND (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.30)
        OR (${preset} = 'high_multipliers' AND da.pins_per_url >= 3.0)
        OR (${preset} = 'multi_account' AND da.accounts_count >= 2)
        OR (${preset} = 'decaying_monopoly' AND da.top10_pins >= 1 AND da.total_saves >= 3000 AND (da.avg_velocity <= 3.0 OR (da.displaced_pins::numeric / GREATEST(1, da.active_serp_pins + da.displaced_pins)) >= 0.25))
      )
      AND (
        ${adNetwork} = 'all'
        OR (${adNetwork} = 'switched' AND dmm.switched_at IS NOT NULL)
        OR (${adNetwork} = 'unchecked' AND (dmm.current_ad_network IS NULL OR dmm.current_ad_network = 'unchecked'))
        OR dmm.current_ad_network = ${adNetwork}
      )
    ),
    modular_evaluated AS (
      SELECT
        e.*,
        CASE
          WHEN ${ageFilter} = 'le_0_5' THEN (e.age_years IS NOT NULL AND e.age_years <= 0.5)
          WHEN ${ageFilter} = 'le_1' THEN (e.age_years IS NOT NULL AND e.age_years <= 1.0)
          WHEN ${ageFilter} = 'le_2' THEN (e.age_years IS NOT NULL AND e.age_years <= 2.0)
          WHEN ${ageFilter} = 'le_3' THEN (e.age_years IS NOT NULL AND e.age_years <= 3.0)
          WHEN ${ageFilter} = 'le_5' THEN (e.age_years IS NOT NULL AND e.age_years <= 5.0)
          WHEN ${ageFilter} = 'gt_5' THEN (e.age_years IS NOT NULL AND e.age_years > 5.0)
          WHEN ${ageFilter} = 'verified' THEN (e.age_years IS NOT NULL)
          WHEN ${ageFilter} = 'unchecked' THEN (e.age_years IS NULL)
          ELSE TRUE
        END AS age_match,
        CASE
          WHEN ${rankFilter} = 'top3' THEN (e.top3_pins >= 1 OR (e.best_rank IS NOT NULL AND e.best_rank <= 3))
          WHEN ${rankFilter} = 'top5' THEN (e.best_rank IS NOT NULL AND e.best_rank <= 5)
          WHEN ${rankFilter} = 'top10' THEN (e.top10_pins >= 1 OR (e.best_rank IS NOT NULL AND e.best_rank <= 10))
          WHEN ${rankFilter} = 'top20' THEN (e.best_rank IS NOT NULL AND e.best_rank <= 20)
          WHEN ${rankFilter} = 'top50' THEN (e.active_serp_pins >= 1)
          WHEN ${rankFilter} = 'displaced' THEN (e.displaced_pins >= 1)
          WHEN ${rankFilter} = 'bleeding' THEN (e.displaced_pins >= 3 AND e.decay_rate_pct >= 30.0)
          ELSE TRUE
        END AS rank_match,
        CASE
          WHEN ${savesFilter} = 'ge_500' THEN (e.total_saves >= 500)
          WHEN ${savesFilter} = 'ge_1k' THEN (e.total_saves >= 1000)
          WHEN ${savesFilter} = 'ge_5k' THEN (e.total_saves >= 5000)
          WHEN ${savesFilter} = 'ge_10k' THEN (e.total_saves >= 10000)
          WHEN ${savesFilter} = 'ge_50k' THEN (e.total_saves >= 50000)
          WHEN ${savesFilter} = 'ge_100k' THEN (e.total_saves >= 100000)
          WHEN ${savesFilter} = 'ge_500k' THEN (e.total_saves >= 500000)
          WHEN ${savesFilter} = 'vel_5' THEN (e.avg_velocity >= 5.0)
          WHEN ${savesFilter} = 'vel_20' THEN (e.avg_velocity >= 20.0)
          ELSE TRUE
        END AS saves_match,
        CASE
          WHEN ${sizeFilter} = 'pins_le_25' THEN (e.total_pins <= 25)
          WHEN ${sizeFilter} = 'pins_le_100' THEN (e.total_pins <= 100)
          WHEN ${sizeFilter} = 'pins_ge_100' THEN (e.total_pins >= 100)
          WHEN ${sizeFilter} = 'pins_ge_500' THEN (e.total_pins >= 500)
          WHEN ${sizeFilter} = 'mult_ge_2' THEN (e.pins_per_url >= 2.0)
          WHEN ${sizeFilter} = 'mult_ge_3' THEN (e.pins_per_url >= 3.0)
          WHEN ${sizeFilter} = 'mult_ge_5' THEN (e.pins_per_url >= 5.0)
          WHEN ${sizeFilter} = 'multi_acct' THEN (e.accounts_count >= 2)
          WHEN ${sizeFilter} = 'pbn_3' THEN (e.accounts_count >= 3)
          ELSE TRUE
        END AS size_match
      FROM enriched e
    ),
    modular_filtered AS (
      SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY visibility_score DESC, total_saves DESC) AS top5_rn
      FROM modular_evaluated
      WHERE (
        CASE
          WHEN ${logicMode} = 'or' AND (${ageFilter} <> 'all' OR ${rankFilter} <> 'all' OR ${savesFilter} <> 'all' OR ${sizeFilter} <> 'all') THEN (
            (${ageFilter} <> 'all' AND age_match)
            OR (${rankFilter} <> 'all' AND rank_match)
            OR (${savesFilter} <> 'all' AND saves_match)
            OR (${sizeFilter} <> 'all' AND size_match)
          )
          ELSE (age_match AND rank_match AND saves_match AND size_match)
        END
      )
    )
    SELECT
      *,
      COUNT(*) OVER()::int AS total_filtered_domains,
      SUM(top10_pins) OVER()::int AS global_top10_slots,
      SUM(CASE WHEN top5_rn <= 5 THEN top10_pins ELSE 0 END) OVER()::int AS top5_global_slots,
      COUNT(*) FILTER (WHERE age_years IS NOT NULL AND age_years <= 2.0 AND (top10_pins >= 1 OR total_saves >= 1000)) OVER()::int AS baby_giants_count,
      COUNT(*) FILTER (WHERE accounts_count >= 2) OVER()::int AS multi_account_domains_count,
      ROUND(AVG(pins_per_url) OVER(), 2) AS global_avg_multiplier
    FROM modular_filtered
    ORDER BY
      CASE WHEN ${sortBy} = 'visibility' THEN visibility_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'pins_count' THEN total_pins END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'avg_rank' THEN avg_rank END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'saves' THEN total_saves END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'velocity' THEN avg_velocity END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'age_asc' THEN age_days END ASC NULLS LAST,
      CASE WHEN ${sortBy} = 'age_desc' THEN age_days END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'arbitrage_score' THEN arbitrage_score END DESC NULLS LAST,
      CASE WHEN ${sortBy} = 'multiplier' THEN pins_per_url END DESC NULLS LAST,
      visibility_score DESC, total_saves DESC
    LIMIT ${lim} OFFSET ${off};
  `;

  const total = rows[0]?.total_filtered_domains || 0;
  const globalTop10 = Math.max(1, Number(rows[0]?.global_top10_slots || 1));
  const top5Share = rows[0]?.top5_global_slots !== undefined
    ? Number(rows[0].top5_global_slots)
    : rows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
  const top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10) * 100)).toFixed(1));

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
 * Refreshes or populates the domain_intelligence_rollup cache table.
 */
export async function refreshDomainIntelligenceRollup(sql) {
  const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  try {
    const res = await sql`
      WITH raw_occurrences AS (
        SELECT
          ksc.domain AS clean_domain,
          ksc.pin_id,
          ksc.keyword_id,
          CASE WHEN ksc.is_displaced = FALSE THEN ksc.rank_position ELSE NULL END AS active_rank,
          ksc.is_displaced,
          COALESCE(ksc.save_count, 0)::bigint AS saves,
          COALESCE(ksc.repin_count, 0)::bigint AS repins,
          COALESCE(ksc.daily_save_velocity, 0)::numeric AS velocity,
          LOWER(REPLACE(COALESCE(ksc.creator_username, ''), '@', '')) AS username,
          COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(ksc.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
          TRUE AS is_serp_ranked
        FROM keyword_serp_current ksc
        WHERE ksc.domain IS NOT NULL AND ksc.domain <> ''

        UNION ALL

        SELECT
          pa.domain AS clean_domain,
          pa.pin_id,
          NULL::int AS keyword_id,
          NULL::int AS active_rank,
          FALSE AS is_displaced,
          COALESCE(pa.saves, 0)::bigint AS saves,
          COALESCE(pa.repins, 0)::bigint AS repins,
          COALESCE(pa.velocity, 0)::numeric AS velocity,
          LOWER(REPLACE(COALESCE(pa.account_username, ''), '@', '')) AS username,
          COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pa.link, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
          FALSE AS is_serp_ranked
        FROM pa_pins pa
        WHERE pa.domain IS NOT NULL AND pa.domain <> ''

        UNION ALL

        -- Competitor Pins: Used strictly for account association & discovery, not for inflating domain's ranked pin volume
        SELECT
          cp.link_domain AS clean_domain,
          cp.pin_id,
          NULL::int AS keyword_id,
          NULL::int AS active_rank,
          FALSE AS is_displaced,
          COALESCE(cp.save_count, 0)::bigint AS saves,
          COALESCE(cp.repin_count, 0)::bigint AS repins,
          -- [INVARIANT: ACCURATE-COMPETITOR-VELOCITY] Extract authentic live daily velocity from competitor pins
          COALESCE((cp.metadata->>'daily_save_velocity')::numeric, (cp.metadata->>'delta_saves_24h')::numeric, 0::numeric) AS velocity,
          LOWER(REPLACE(COALESCE(cprof.username, ''), '@', '')) AS username,
          COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(cp.destination_url, ''), '^https?://(www\\.)?[^/]+', ''), '[?#].*$', '')), ''), '/') AS url_slug,
          FALSE AS is_serp_ranked
        FROM competitor_pins cp
        LEFT JOIN competitor_profiles cprof ON cprof.id = cp.competitor_id
        WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''

        UNION ALL

        -- Displaced Pillar: keyword_displaced_index
        SELECT
          kdi.domain AS clean_domain,
          kdi.pin_id,
          kdi.keyword_id,
          kdi.last_known_rank AS active_rank,
          TRUE AS is_displaced,
          COALESCE(kdi.save_count, 0)::bigint AS saves,
          COALESCE(kdi.repin_count, 0)::bigint AS repins,
          COALESCE(kdi.daily_save_velocity, 0)::numeric AS velocity,
          '' AS username,
          '/' AS url_slug,
          TRUE AS is_serp_ranked
        FROM keyword_displaced_index kdi
        WHERE kdi.domain IS NOT NULL AND kdi.domain <> ''

        UNION ALL

        SELECT
          drm.domain AS clean_domain,
          'reg_' || drm.domain AS pin_id,
          NULL::int AS keyword_id,
          NULL::int AS active_rank,
          TRUE AS is_displaced,
          0::bigint AS saves,
          0::bigint AS repins,
          0::numeric AS velocity,
          '' AS username,
          '/' AS url_slug,
          FALSE AS is_serp_ranked
        FROM domain_registry_metadata drm
        WHERE drm.domain IS NOT NULL AND drm.domain <> '' AND drm.domain LIKE '%.%'
      ),
      dedup_pins AS (
        SELECT
          clean_domain,
          pin_id,
          MIN(active_rank) AS active_rank,
          BOOL_OR(is_displaced) AS is_displaced,
          BOOL_OR(is_serp_ranked) AS is_serp_ranked,
          MAX(saves) AS saves,
          MAX(repins) AS repins,
          MAX(velocity) AS velocity,
          (ARRAY_AGG(username) FILTER (WHERE username <> ''))[1] AS sample_username,
          (ARRAY_AGG(url_slug) FILTER (WHERE url_slug IS NOT NULL))[1] AS url_slug
        FROM raw_occurrences
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
          AND clean_domain NOT IN ('pinterest.com', 'www.pinterest.com', 'pin.it', 'uploaded by user', 'localhost')
        GROUP BY clean_domain, pin_id
      ),
      domain_agg AS (
        SELECT
          dp.clean_domain AS domain,
          -- [INVARIANT: SERP-ONLY-RANKED-PINS-COUNTING]
          -- Only count pins observed in SERP/Displaced rankings when calculating domain metrics
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE)::int
            ELSE COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%'))::int
          END AS total_pins,
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN GREATEST(1, COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/'))::int
            ELSE GREATEST(1, COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/'))::int
          END AS unique_urls,
          ROUND(
            COALESCE(
              NULLIF(
                CASE
                  WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
                  THEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE)
                  ELSE COUNT(DISTINCT dp.pin_id) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%'))
                END, 0
              ), 1
            )::numeric / 
            GREATEST(
              1,
              CASE
                WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
                THEN COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
                ELSE COUNT(DISTINCT dp.url_slug) FILTER (WHERE dp.url_slug IS NOT NULL AND dp.url_slug <> '/')
              END
            ), 
            2
          ) AS pins_per_url,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank IS NOT NULL)::int AS active_serp_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 3)::int AS top3_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 10)::int AS top10_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 11 AND 50)::int AS rank_11_50_pins,
          COUNT(dp.pin_id) FILTER (WHERE dp.is_displaced = TRUE AND dp.is_serp_ranked = TRUE)::int AS displaced_pins,
          MIN(dp.active_rank) AS best_rank,
          ROUND(AVG(dp.active_rank), 1) AS avg_rank,
          ROUND(
            (
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank <= 3) * 100) +
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 4 AND 10) * 45) +
              (COUNT(dp.pin_id) FILTER (WHERE dp.active_rank BETWEEN 11 AND 50) * 12)
            )::numeric,
            1
          ) AS visibility_score,
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN COALESCE(SUM(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0)::bigint
            ELSE COALESCE(SUM(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0)::bigint
          END AS total_saves,
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN ROUND(COALESCE(AVG(dp.saves) FILTER (WHERE dp.is_serp_ranked = TRUE), 0), 1)
            ELSE ROUND(COALESCE(AVG(dp.saves) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0), 1)
          END AS avg_saves,
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN COALESCE(SUM(dp.repins) FILTER (WHERE dp.is_serp_ranked = TRUE), 0)::bigint
            ELSE COALESCE(SUM(dp.repins) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%')), 0)::bigint
          END AS total_repins,
          -- [INVARIANT: DUAL-DOMAIN-VELOCITY] Non-diluted active pin average excluding 0-velocity displaced pins
          CASE
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.velocity > 0) > 0
            THEN ROUND(COALESCE(AVG(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE AND dp.velocity > 0), 0), 2)
            WHEN COUNT(DISTINCT dp.pin_id) FILTER (WHERE dp.is_serp_ranked = TRUE) > 0
            THEN ROUND(COALESCE(AVG(dp.velocity) FILTER (WHERE dp.is_serp_ranked = TRUE), 0), 2)
            ELSE ROUND(COALESCE(AVG(dp.velocity) FILTER (WHERE NOT (dp.pin_id LIKE 'reg_%') AND dp.velocity > 0), 0), 2)
          END AS avg_velocity,
          COUNT(DISTINCT dp.sample_username) FILTER (WHERE dp.sample_username IS NOT NULL AND dp.sample_username <> '')::int AS accounts_count,
          (ARRAY_AGG(DISTINCT dp.sample_username) FILTER (WHERE dp.sample_username IS NOT NULL AND dp.sample_username <> ''))[1:5] AS sample_accounts
        FROM dedup_pins dp
        GROUP BY dp.clean_domain
      ),
      enriched AS (
        SELECT
          da.*,
          drm.registered_at AS domain_created_at,
          drm.expires_at AS domain_expires_at,
          CASE
            WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 86400))::int
            ELSE drm.initial_age_days
          END AS age_days,
          CASE
            WHEN drm.registered_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric, 2)
            ELSE drm.initial_age_years
          END AS age_years,
          COALESCE(drm.lookup_status, 'unchecked') AS age_status,
          COALESCE(dmm.current_ad_network, 'unchecked') AS ad_network,
          dmm.ad_manager_domain,
          dmm.primary_pub_id,
          dmm.previous_ad_network,
          dmm.switched_at AS ad_switched_at,
          COALESCE(dmm.network_history, '[]'::jsonb) AS ad_network_history,
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
                  CASE WHEN drm.registered_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - drm.registered_at)) / 31557600)::numeric ELSE NULL END,
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
      )
      INSERT INTO domain_intelligence_rollup (
        domain, total_pins, unique_urls, pins_per_url, active_serp_pins,
        top3_pins, top10_pins, rank_11_50_pins, displaced_pins, best_rank, avg_rank,
        visibility_score, total_saves, avg_saves, total_repins, avg_velocity,
        accounts_count, sample_accounts, domain_created_at, domain_expires_at,
        age_days, age_years, age_status, ad_network, ad_manager_domain, primary_pub_id,
        previous_ad_network, ad_switched_at, ad_network_history, ads_txt_status,
        decay_rate_pct, arbitrage_score, refreshed_at
      )
      SELECT
        e.domain, e.total_pins, e.unique_urls, e.pins_per_url, e.active_serp_pins,
        e.top3_pins, e.top10_pins, e.rank_11_50_pins, e.displaced_pins, e.best_rank, e.avg_rank,
        e.visibility_score, e.total_saves, e.avg_saves, e.total_repins, e.avg_velocity,
        e.accounts_count, to_jsonb(COALESCE(e.sample_accounts, ARRAY[]::text[])), e.domain_created_at, e.domain_expires_at,
        e.age_days, e.age_years, e.age_status, e.ad_network, e.ad_manager_domain, e.primary_pub_id,
        e.previous_ad_network, e.ad_switched_at, e.ad_network_history, e.ads_txt_status,
        e.decay_rate_pct, e.arbitrage_score, NOW()
      FROM enriched e
      ON CONFLICT (domain) DO UPDATE SET
        total_pins = EXCLUDED.total_pins,
        unique_urls = EXCLUDED.unique_urls,
        pins_per_url = EXCLUDED.pins_per_url,
        active_serp_pins = EXCLUDED.active_serp_pins,
        top3_pins = EXCLUDED.top3_pins,
        top10_pins = EXCLUDED.top10_pins,
        rank_11_50_pins = EXCLUDED.rank_11_50_pins,
        displaced_pins = EXCLUDED.displaced_pins,
        best_rank = EXCLUDED.best_rank,
        avg_rank = EXCLUDED.avg_rank,
        visibility_score = EXCLUDED.visibility_score,
        total_saves = EXCLUDED.total_saves,
        avg_saves = EXCLUDED.avg_saves,
        total_repins = EXCLUDED.total_repins,
        avg_velocity = EXCLUDED.avg_velocity,
        accounts_count = EXCLUDED.accounts_count,
        sample_accounts = EXCLUDED.sample_accounts,
        domain_created_at = EXCLUDED.domain_created_at,
        domain_expires_at = EXCLUDED.domain_expires_at,
        age_days = EXCLUDED.age_days,
        age_years = EXCLUDED.age_years,
        age_status = EXCLUDED.age_status,
        ad_network = EXCLUDED.ad_network,
        ad_manager_domain = EXCLUDED.ad_manager_domain,
        primary_pub_id = EXCLUDED.primary_pub_id,
        previous_ad_network = EXCLUDED.previous_ad_network,
        ad_switched_at = EXCLUDED.ad_switched_at,
        ad_network_history = EXCLUDED.ad_network_history,
        ads_txt_status = EXCLUDED.ads_txt_status,
        decay_rate_pct = EXCLUDED.decay_rate_pct,
        arbitrage_score = EXCLUDED.arbitrage_score,
        refreshed_at = NOW();
    `;
    return { success: true, count: res?.length || 0 };
  } catch (err) {
    console.warn(`[refreshDomainIntelligenceRollup] Error refreshing rollup:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Synchronizes a single domain's aggregated metrics directly into domain_intelligence_rollup.
 * Designed for micro-sync on dossier request (<5ms) without full table re-aggregation.
 * 
 * // [INVARIANT: SINGLE-DOMAIN-SYNC-O1]
 */
export async function syncSingleDomainRollup(sql, cleanDomain, dossierData) {
  if (!sql || !cleanDomain || !dossierData) return null;
  const summary = dossierData.summary || dossierData.metrics || {};
  const totalPins = Number(summary.total_pins || 0);
  const totalSaves = Number(summary.total_saves || 0);
  const uniqueUrls = Number(summary.unique_urls || 1);
  const pinsPerUrl = Number(summary.pins_per_url || 1);
  const activeSerpPins = Number(summary.active_pins_count || 0);
  const displacedPins = Number(summary.displaced_pins_count || 0);
  const accountsCount = Number(summary.accounts_count || 0);

  // Compute non-diluted active velocity if not explicitly provided in summary
  let avgVelocity = Number(summary.avg_velocity || 0);
  if (!avgVelocity && Array.isArray(dossierData.ranked_pins)) {
    const activePinsWithVelocity = dossierData.ranked_pins.filter(p => !p.is_displaced && Number(p.velocity || 0) > 0);
    if (activePinsWithVelocity.length > 0) {
      const sumVel = activePinsWithVelocity.reduce((sum, p) => sum + Number(p.velocity || 0), 0);
      avgVelocity = Number((sumVel / activePinsWithVelocity.length).toFixed(2));
    }
  }

  const ageInfo = dossierData.age_info || {};
  const adInfo = dossierData.ad_info || {};

  try {
    const [result] = await sql`
      INSERT INTO domain_intelligence_rollup (
        domain, total_pins, total_saves, accounts_count, unique_urls, pins_per_url,
        active_serp_pins, displaced_pins, avg_velocity,
        ad_network, ad_manager_domain, primary_pub_id, ads_txt_status,
        age_days, age_years, age_status, domain_created_at, domain_expires_at,
        refreshed_at
      ) VALUES (
        ${cleanDomain}, ${totalPins}, ${totalSaves}, ${accountsCount}, ${uniqueUrls}, ${pinsPerUrl},
        ${activeSerpPins}, ${displacedPins}, ${avgVelocity},
        ${adInfo.current_ad_network || adInfo.ad_network || 'unchecked'},
        ${adInfo.ad_manager_domain || null},
        ${adInfo.primary_pub_id || null},
        ${adInfo.ads_txt_status || 'pending'},
        ${ageInfo.age_days != null ? Number(ageInfo.age_days) : null},
        ${ageInfo.age_years != null ? Number(ageInfo.age_years) : null},
        ${ageInfo.lookup_status || 'unchecked'},
        ${ageInfo.registered_at ? new Date(ageInfo.registered_at) : null},
        ${ageInfo.expires_at ? new Date(ageInfo.expires_at) : null},
        NOW()
      )
      ON CONFLICT (domain) DO UPDATE SET
        total_pins = EXCLUDED.total_pins,
        total_saves = EXCLUDED.total_saves,
        accounts_count = EXCLUDED.accounts_count,
        unique_urls = EXCLUDED.unique_urls,
        pins_per_url = EXCLUDED.pins_per_url,
        active_serp_pins = EXCLUDED.active_serp_pins,
        displaced_pins = EXCLUDED.displaced_pins,
        avg_velocity = CASE WHEN EXCLUDED.avg_velocity > 0 THEN EXCLUDED.avg_velocity ELSE domain_intelligence_rollup.avg_velocity END,
        ad_network = CASE WHEN EXCLUDED.ad_network <> 'unchecked' THEN EXCLUDED.ad_network ELSE domain_intelligence_rollup.ad_network END,
        ad_manager_domain = COALESCE(EXCLUDED.ad_manager_domain, domain_intelligence_rollup.ad_manager_domain),
        primary_pub_id = COALESCE(EXCLUDED.primary_pub_id, domain_intelligence_rollup.primary_pub_id),
        ads_txt_status = CASE WHEN EXCLUDED.ads_txt_status <> 'pending' THEN EXCLUDED.ads_txt_status ELSE domain_intelligence_rollup.ads_txt_status END,
        age_days = COALESCE(EXCLUDED.age_days, domain_intelligence_rollup.age_days),
        age_years = COALESCE(EXCLUDED.age_years, domain_intelligence_rollup.age_years),
        age_status = CASE WHEN EXCLUDED.age_status <> 'unchecked' THEN EXCLUDED.age_status ELSE domain_intelligence_rollup.age_status END,
        domain_created_at = COALESCE(EXCLUDED.domain_created_at, domain_intelligence_rollup.domain_created_at),
        domain_expires_at = COALESCE(EXCLUDED.domain_expires_at, domain_intelligence_rollup.domain_expires_at),
        refreshed_at = NOW()
      RETURNING *;
    `;
    return result || null;
  } catch (err) {
    console.warn(`[syncSingleDomainRollup] Failed for ${cleanDomain}:`, err.message);
    return null;
  }
}

/**
 * Fast Domain Intelligence querying domain_intelligence_rollup with graceful fallback to on-the-fly CTE
 */
export async function listDomainsIntelligenceFast(sql, options = {}) {
  const fId = options.folderId && !isNaN(Number(options.folderId)) ? Number(options.folderId) : null;
  const kId = options.keywordId && !isNaN(Number(options.keywordId)) ? Number(options.keywordId) : null;
  const pillar = options.pillar || 'all';

  if (fId === null && kId === null && pillar === 'all') {
    try {
      const search = options.search || '';
      const preset = options.preset || 'all';
      const adNetwork = options.adNetwork || 'all';
      const ageFilter = options.ageFilter || 'all';
      const rankFilter = options.rankFilter || 'all';
      const savesFilter = options.savesFilter || 'all';
      const sizeFilter = options.sizeFilter || 'all';
      const logicMode = options.logicMode || 'and';
      const excludeMarketplaces = options.excludeMarketplaces !== false;
      const minPins = Math.max(1, parseInt(options.minPins, 10) || 1);
      const sortBy = options.sortBy || 'visibility';
      const page = Math.max(1, parseInt(options.page, 10) || 1);
      const limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 50, 200));
      const offset = (page - 1) * limit;
      const searchPattern = search ? `%${escapeSqlLike(search)}%` : null;

      const rows = await sql`
        WITH rollup_src AS (
          SELECT *
          FROM domain_intelligence_rollup r
          WHERE (${minPins} <= 1 OR r.total_pins >= ${minPins})
            AND (${searchPattern}::text IS NULL OR r.domain ILIKE ${searchPattern})
            AND (
              ${excludeMarketplaces} = FALSE
              OR r.domain NOT IN (
                'etsy.com', 'amazon.com', 'amazon.co.uk', 'amzn.to', 'walmart.com', 'target.com',
                'ebay.com', 'aliexpress.com', 'temu.com', 'shein.com', 'ltks.co', 'liketoknow.it',
                'shopltk.com', 'rstyle.me', 'shopstyle.it', 'youtube.com', 'youtu.be', 'instagram.com',
                'tiktok.com', 'facebook.com', 'twitter.com', 'x.com', 'reddit.com', 'threads.net',
                'linkedin.com', 'quora.com', 'tumblr.com', 'medium.com', 'wikipedia.org',
                'google.com', 'share.google', 'drive.google.com', 'docs.google.com', 'storage.googleapis.com',
                'blogger.googleusercontent.com'
              )
            )
            AND (
              ${preset} = 'all'
              OR (${preset} = 'baby_giants' AND r.age_years IS NOT NULL AND r.age_years <= 2.0 AND (r.top10_pins >= 1 OR r.total_saves >= 1000))
              OR (${preset} = 'easy_arbitrage' AND r.total_pins <= 25 AND (r.top10_pins >= 1 OR r.avg_velocity >= 5))
              OR (${preset} = 'bleeding_giants' AND r.displaced_pins >= 3 AND r.decay_rate_pct >= 30.0)
              OR (${preset} = 'high_multipliers' AND r.pins_per_url >= 3.0)
              OR (${preset} = 'multi_account' AND r.accounts_count >= 2)
              OR (${preset} = 'decaying_monopoly' AND r.top10_pins >= 1 AND r.total_saves >= 3000 AND (r.avg_velocity <= 3.0 OR r.decay_rate_pct >= 25.0))
            )
            AND (
              ${adNetwork} = 'all'
              OR (${adNetwork} = 'switched' AND r.ad_switched_at IS NOT NULL)
              OR (${adNetwork} = 'unchecked' AND (r.ad_network IS NULL OR r.ad_network = 'unchecked'))
              OR r.ad_network = ${adNetwork}
            )
        ),
        modular_evaluated AS (
          SELECT
            r.*,
            CASE
              WHEN ${ageFilter} = 'le_0_5' THEN (r.age_years IS NOT NULL AND r.age_years <= 0.5)
              WHEN ${ageFilter} = 'le_1' THEN (r.age_years IS NOT NULL AND r.age_years <= 1.0)
              WHEN ${ageFilter} = 'le_2' THEN (r.age_years IS NOT NULL AND r.age_years <= 2.0)
              WHEN ${ageFilter} = 'le_3' THEN (r.age_years IS NOT NULL AND r.age_years <= 3.0)
              WHEN ${ageFilter} = 'le_5' THEN (r.age_years IS NOT NULL AND r.age_years <= 5.0)
              WHEN ${ageFilter} = 'gt_5' THEN (r.age_years IS NOT NULL AND r.age_years > 5.0)
              WHEN ${ageFilter} = 'verified' THEN (r.age_years IS NOT NULL)
              WHEN ${ageFilter} = 'unchecked' THEN (r.age_years IS NULL)
              ELSE TRUE
            END AS age_match,
            CASE
              WHEN ${rankFilter} = 'top3' THEN (r.top3_pins >= 1 OR (r.best_rank IS NOT NULL AND r.best_rank <= 3))
              WHEN ${rankFilter} = 'top5' THEN (r.best_rank IS NOT NULL AND r.best_rank <= 5)
              WHEN ${rankFilter} = 'top10' THEN (r.top10_pins >= 1 OR (r.best_rank IS NOT NULL AND r.best_rank <= 10))
              WHEN ${rankFilter} = 'top20' THEN (r.best_rank IS NOT NULL AND r.best_rank <= 20)
              WHEN ${rankFilter} = 'top50' THEN (r.active_serp_pins >= 1)
              WHEN ${rankFilter} = 'displaced' THEN (r.displaced_pins >= 1)
              WHEN ${rankFilter} = 'bleeding' THEN (r.displaced_pins >= 3 AND r.decay_rate_pct >= 30.0)
              ELSE TRUE
            END AS rank_match,
            CASE
              WHEN ${savesFilter} = 'ge_500' THEN (r.total_saves >= 500)
              WHEN ${savesFilter} = 'ge_1k' THEN (r.total_saves >= 1000)
              WHEN ${savesFilter} = 'ge_5k' THEN (r.total_saves >= 5000)
              WHEN ${savesFilter} = 'ge_10k' THEN (r.total_saves >= 10000)
              WHEN ${savesFilter} = 'ge_50k' THEN (r.total_saves >= 50000)
              WHEN ${savesFilter} = 'ge_100k' THEN (r.total_saves >= 100000)
              WHEN ${savesFilter} = 'ge_500k' THEN (r.total_saves >= 500000)
              WHEN ${savesFilter} = 'vel_5' THEN (r.avg_velocity >= 5.0)
              WHEN ${savesFilter} = 'vel_20' THEN (r.avg_velocity >= 20.0)
              ELSE TRUE
            END AS saves_match,
            CASE
              WHEN ${sizeFilter} = 'pins_le_25' THEN (r.total_pins <= 25)
              WHEN ${sizeFilter} = 'pins_le_100' THEN (r.total_pins <= 100)
              WHEN ${sizeFilter} = 'pins_ge_100' THEN (r.total_pins >= 100)
              WHEN ${sizeFilter} = 'pins_ge_500' THEN (r.total_pins >= 500)
              WHEN ${sizeFilter} = 'mult_ge_2' THEN (r.pins_per_url >= 2.0)
              WHEN ${sizeFilter} = 'mult_ge_3' THEN (r.pins_per_url >= 3.0)
              WHEN ${sizeFilter} = 'mult_ge_5' THEN (r.pins_per_url >= 5.0)
              WHEN ${sizeFilter} = 'multi_acct' THEN (r.accounts_count >= 2)
              WHEN ${sizeFilter} = 'pbn_3' THEN (r.accounts_count >= 3)
              ELSE TRUE
            END AS size_match
          FROM rollup_src r
        ),
        modular_filtered AS (
          SELECT
            *,
            ROW_NUMBER() OVER (ORDER BY visibility_score DESC, total_saves DESC) AS top5_rn
          FROM modular_evaluated
          WHERE (
            CASE
              WHEN ${logicMode} = 'or' AND (${ageFilter} <> 'all' OR ${rankFilter} <> 'all' OR ${savesFilter} <> 'all' OR ${sizeFilter} <> 'all') THEN (
                (${ageFilter} <> 'all' AND age_match)
                OR (${rankFilter} <> 'all' AND rank_match)
                OR (${savesFilter} <> 'all' AND saves_match)
                OR (${sizeFilter} <> 'all' AND size_match)
              )
              ELSE (age_match AND rank_match AND saves_match AND size_match)
            END
          )
        )
        SELECT
          *,
          COUNT(*) OVER()::int AS total_filtered_domains,
          SUM(top10_pins) OVER()::int AS global_top10_slots,
          SUM(CASE WHEN top5_rn <= 5 THEN top10_pins ELSE 0 END) OVER()::int AS top5_global_slots,
          COUNT(*) FILTER (WHERE age_years IS NOT NULL AND age_years <= 2.0 AND (top10_pins >= 1 OR total_saves >= 1000)) OVER()::int AS baby_giants_count,
          COUNT(*) FILTER (WHERE accounts_count >= 2) OVER()::int AS multi_account_domains_count,
          ROUND(AVG(pins_per_url) OVER(), 2) AS global_avg_multiplier
        FROM modular_filtered
        ORDER BY
          CASE WHEN ${sortBy} = 'visibility' THEN visibility_score END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'pins_count' THEN total_pins END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'avg_rank' THEN avg_rank END ASC NULLS LAST,
          CASE WHEN ${sortBy} = 'saves' THEN total_saves END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'velocity' THEN avg_velocity END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'age_asc' THEN age_days END ASC NULLS LAST,
          CASE WHEN ${sortBy} = 'age_desc' THEN age_days END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'arbitrage_score' THEN arbitrage_score END DESC NULLS LAST,
          CASE WHEN ${sortBy} = 'multiplier' THEN pins_per_url END DESC NULLS LAST,
          visibility_score DESC, total_saves DESC
        LIMIT ${limit} OFFSET ${offset};
      `;

      if (rows && rows.length > 0) {
        const total = rows[0]?.total_filtered_domains || 0;
        const globalTop10 = Math.max(1, Number(rows[0]?.global_top10_slots || 1));
        const top5Share = rows[0]?.top5_global_slots !== undefined
          ? Number(rows[0].top5_global_slots)
          : rows.slice(0, 5).reduce((acc, r) => acc + Number(r.top10_pins || 0), 0);
        const top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10) * 100)).toFixed(1));

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
          missing_age_domains: rows.filter(r => !r.age_status && r.domain).map(r => r.domain).slice(0, 8),
          missing_ad_domains: rows
            .filter(r => (!r.ad_network || r.ad_network === 'unchecked') && r.domain)
            .map(r => r.domain)
            .slice(0, 10),
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          cached: true
        };
      } else {
        // [INVARIANT: ZERO-ROW-FALLBACK-GUARD] Guard against unpopulated table without triggering storm on empty searches
        const [countCheck] = await sql`SELECT 1 FROM domain_intelligence_rollup LIMIT 1;`.catch(() => []);
        if (!countCheck) {
          // Table is truly empty on Day-0: trigger background refresh and fallback
          refreshDomainIntelligenceRollup(sql).catch(() => {});
          return await listDomainsIntelligence(sql, options);
        }
        // Legitimate empty search/filter result: return full contract object with empty list
        return {
          overview: {
            total_domains: 0,
            top5_monopoly_pct: 0,
            baby_giants_count: 0,
            multi_account_count: 0,
            avg_pins_per_url: 1.0
          },
          domains: [],
          missing_age_domains: [],
          missing_ad_domains: [],
          page: Number(options.page || 1),
          limit: Number(options.limit || 50),
          total: 0,
          total_pages: 1,
          cached: true
        };
      }
    } catch (fastErr) {
      console.warn(`[listDomainsIntelligenceFast] Rollup query fallback:`, fastErr.message);
      refreshDomainIntelligenceRollup(sql).catch(() => {});
    }
  }

  return await listDomainsIntelligence(sql, options);
}

/**
 * Detects marketing angle and search intent based on title, keywords, and visual annotations
 */
export function detectMarketingAngle({ title = '', keywords = [], annotations = [] } = {}) {
  // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING] Safely unpack rich objects { name: '...' } into clean string tags
  const normAnnotations = (Array.isArray(annotations) ? annotations : [])
    .map(a => typeof a === 'string' ? a.trim() : (a?.name || a?.label || a?.tag || '').trim())
    .filter(Boolean);
  const combined = `${title || ''} ${(Array.isArray(keywords) ? keywords.join(' ') : '')} ${normAnnotations.join(' ')}`.toLowerCase();

  if (/\b(keto|low carb|healthy|diet|clean eating|gluten[- ]free|gf|whole30|paleo|sugar free|macro|calorie|slimming)\b/i.test(combined)) {
    return {
      angle: 'Diet & Keto / Healthy',
      intent_tag: 'Diet / Low-Carb',
      badge_color: 'emerald'
    };
  }
  if (/\b(easy|quick|minute|min|simple|fast|lazy|instant|speedy|30 min|15 min|20 min|10 min|5 min)\b/i.test(combined)) {
    return {
      angle: 'Quick & Easy / 15-Min',
      intent_tag: 'Speed & Simplicity',
      badge_color: 'amber'
    };
  }
  if (/\b(family|kid|children|budget|cheap|crockpot|slow cooker|casserole|sheet pan|freezer|meal prep|weeknight|bulk|one pot|frugal)\b/i.test(combined)) {
    return {
      angle: 'Family & Budget Meal',
      intent_tag: 'Budget & Family',
      badge_color: 'sky'
    };
  }
  if (/\b(melt|cheesy|cheese|garlic|butter|bacon|cream|creamy|smothered|baked|restaurant|crispy|parmesan|steakhouse|sauce|skillet|gourmet)\b/i.test(combined)) {
    return {
      angle: 'Gourmet Skillet & Comfort',
      intent_tag: 'Comfort & Indulgence',
      badge_color: 'rose'
    };
  }
  if (/\b(party|potluck|holiday|anniversary|sunday dinner|crowd|game day|bbq|summer|thanksgiving|christmas|easter)\b/i.test(combined)) {
    return {
      angle: 'Entertaining & Crowd Pleaser',
      intent_tag: 'Entertaining / Party',
      badge_color: 'purple'
    };
  }

  return {
    angle: 'Classic & Evergreen Recipe',
    intent_tag: 'Evergreen Classic',
    badge_color: 'slate'
  };
}

/**
 * Deep Forensic Dossier for a Specific Domain:
 * 1. Live WHOIS / Age check via fetchAndCacheDomainAge & Ads.txt Monetization Profile
 * 2. All Ranked Pins & SERP Positions across Keywords with Vulnerability Radar
 * 3. Top Money URLs with Multi-Angle Creative Multiplier Breakdown
 * 4. Keyword Monopoly Matrix (Carpet Bombing: URL Flooding vs Topic Cluster)
 * 5. P2P Sybil Network (Primary Brand vs Satellite Creators & Cross-Domain Footprint)
 * 6. Reverse-Engineered Visual DNA (Computer Vision Annotations Cloud & Palette)
 */
export async function getDomainDeepDossier(sql, rawDomain, { folderId = null, keywordId = null, env = null, skipShardHydration = false, fastPath = true } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) throw new Error('Valid domain is required.');

  const fId = folderId && !isNaN(Number(folderId)) ? Number(folderId) : null;
  const kId = keywordId && !isNaN(Number(keywordId)) ? Number(keywordId) : null;

  const [ageInfo, adInfo, serpPins, archivePins, compPins, displacedPins] = await Promise.all([
    fetchAndCacheDomainAge(sql, cleanDomain, { fastPath }),
    fetchAndCacheDomainAdNetwork(sql, cleanDomain, { fastPath }).catch(() => null),
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
        ksc.created_at_pinterest,
        COALESCE(ksc.metadata, '{}'::jsonb) AS metadata
      FROM keyword_serp_current ksc
      LEFT JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
      WHERE ksc.domain = ${cleanDomain}
        AND (${fId}::int IS NULL OR ksc.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR ksc.keyword_id = ${kId})
      ORDER BY ksc.is_displaced ASC, ksc.rank_position ASC NULLS LAST, ksc.save_count DESC;
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
      WHERE pa.domain = ${cleanDomain}
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
      WHERE cp.link_domain = ${cleanDomain}
      ORDER BY cp.save_count DESC
      LIMIT 200;
    `.catch(() => []),
    sql`
      SELECT
        kdi.pin_id,
        kdi.keyword_id,
        tk.keyword AS keyword_name,
        NULL::int AS rank_position,
        kdi.last_known_rank,
        TRUE AS is_displaced,
        kdi.displaced_date,
        '' AS title,
        '' AS destination_url,
        '' AS image_url,
        '' AS creator_username,
        '' AS board_name,
        COALESCE(kdi.save_count, 0)::bigint AS saves,
        COALESCE(kdi.repin_count, 0)::bigint AS repins,
        COALESCE(kdi.daily_save_velocity, 0)::numeric AS velocity,
        NULL AS dominant_color,
        '[]'::jsonb AS visual_annotations,
        NULL::timestamptz AS created_at_pinterest,
        '{}'::jsonb AS metadata
      FROM keyword_displaced_index kdi
      LEFT JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
      WHERE kdi.domain = ${cleanDomain}
        AND (${fId}::int IS NULL OR kdi.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        AND (${kId}::int IS NULL OR kdi.keyword_id = ${kId})
      ORDER BY kdi.save_count DESC;
    `.catch(() => [])
  ]);

  // 1. Consolidate Unique Pins with their SERP Rank Appearances
  const pinsMap = new Map();
  const keywordMatrixMap = new Map();
  const accountsMap = new Map();

  const registerPin = (row, sourcePillar) => {
    const pid = String(row.pin_id || '').trim();
    if (!pid) return;
    const rawUser = String(row.creator_username || '').replace(/^@+/, '').trim();
    const cleanUser = rawUser.toLowerCase();
    if (cleanUser) {
      if (!accountsMap.has(cleanUser)) {
        accountsMap.set(cleanUser, {
          username: cleanUser,
          raw_usernames: new Set(),
          pins_count: 0,
          total_saves: 0,
          top10_count: 0
        });
      }
      if (rawUser) {
        accountsMap.get(cleanUser).raw_usernames.add(rawUser);
      }
    }

    let parsedAnnotations = [];
    if (Array.isArray(row.visual_annotations)) {
      parsedAnnotations = row.visual_annotations;
    } else if (typeof row.visual_annotations === 'string') {
      try { parsedAnnotations = JSON.parse(row.visual_annotations); } catch (_) {}
    }

    // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING]
    // Safely unpack rich object annotations (e.g. { name: '...', url: '...' } from pa_pins / Pinterest GraphQL)
    parsedAnnotations = (Array.isArray(parsedAnnotations) ? parsedAnnotations : [])
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return (item.name || item.tag || item.label || item.display_label || '').trim();
        return '';
      })
      .filter(t => Boolean(t) && t !== '[object Object]');

    let parsedMeta = {};
    if (row.metadata && typeof row.metadata === 'object') {
      parsedMeta = row.metadata;
    } else if (typeof row.metadata === 'string') {
      try { parsedMeta = JSON.parse(row.metadata); } catch (_) {}
    }

    let cleanSlug = '/';
    if (row.destination_url) {
      try {
        const u = new URL(row.destination_url.startsWith('http') ? row.destination_url : `https://${row.destination_url}`);
        cleanSlug = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      } catch (_) {}
    }

    if (!pinsMap.has(pid)) {
      pinsMap.set(pid, {
        pin_id: pid,
        title: row.title || `Pin #${pid}`,
        destination_url: row.destination_url || '',
        clean_slug: cleanSlug,
        image_url: row.image_url || '',
        creator_username: cleanUser,
        board_name: row.board_name || '',
        saves: Number(row.saves || 0),
        repins: Number(row.repins || 0),
        velocity: Number(row.velocity || 0),
        dominant_color: row.dominant_color || '#888888',
        visual_annotations: parsedAnnotations,
        metadata: parsedMeta,
        aspect_ratio: parsedMeta.aspect_ratio || '2:3',
        created_at_pinterest: row.created_at_pinterest || null,
        best_rank: null,
        is_displaced: false,
        is_vulnerable: false,
        vulnerability_score: 0,
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
        existing.clean_slug = cleanSlug;
      }
      if (parsedAnnotations.length > 0 && existing.visual_annotations.length === 0) {
        existing.visual_annotations = parsedAnnotations;
      }
      if (row.dominant_color && existing.dominant_color === '#888888') {
        existing.dominant_color = row.dominant_color;
      }
      existing.pillars.add(sourcePillar);
    }

    if ((sourcePillar === 'serp' || sourcePillar === 'displaced') && row.keyword_id) {
      const pEntry = pinsMap.get(pid);
      const activeRank = !row.is_displaced && row.rank_position ? Number(row.rank_position) : null;
      if (activeRank !== null && (pEntry.best_rank === null || activeRank < pEntry.best_rank)) {
        pEntry.best_rank = activeRank;
      }
      if (row.is_displaced && pEntry.best_rank === null) {
        pEntry.is_displaced = true;
      }

      // Pillar 5: Freshness Gap & Decaying Monopoly Calculation
      let vulnScore = 0;
      if (activeRank !== null && activeRank <= 10) {
        const s = Number(row.saves || 0);
        const v = Number(row.velocity || 0);
        if (s >= 10000 && v <= 1.0) vulnScore = 95;
        else if (s >= 5000 && v <= 2.0) vulnScore = 88;
        else if (s >= 3000 && v <= 3.0) vulnScore = 78;
        else if (s >= 1000 && v <= 1.0) vulnScore = 65;
        else if (s >= 500 && v <= 0.5) vulnScore = 40;
      }
      pEntry.vulnerability_score = Math.max(pEntry.vulnerability_score || 0, vulnScore);
      pEntry.is_vulnerable = pEntry.vulnerability_score >= 70;

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
          total_saves: 0,
          unique_urls: new Set(),
          slots_detail: [],
          is_decaying_monopoly: false
        });
      }
      const kwEntry = keywordMatrixMap.get(kwKey);
      kwEntry.total_saves += Number(row.saves || 0);
      if (row.destination_url) {
        kwEntry.unique_urls.add(cleanSlug);
      }

      const slotDetail = {
        pin_id: pid,
        rank_position: activeRank,
        last_known_rank: row.last_known_rank ? Number(row.last_known_rank) : null,
        is_displaced: Boolean(row.is_displaced),
        saves: Number(row.saves || 0),
        velocity: Number(row.velocity || 0),
        title: row.title || `Pin #${pid}`,
        destination_url: row.destination_url || '',
        clean_slug: cleanSlug,
        image_url: row.image_url || '',
        creator_username: cleanUser,
        dominant_color: pEntry.dominant_color,
        visual_annotations: pEntry.visual_annotations,
        is_vulnerable: pEntry.is_vulnerable
      };
      kwEntry.slots_detail.push(slotDetail);

      if (slotDetail.is_vulnerable) {
        kwEntry.is_decaying_monopoly = true;
      }

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

  // Pre-enrich displaced pins from Hub competitor/archive catalog if available (Tier 1 Hub lookup)
  const hubCatalogLookup = new Map();
  for (const r of compPins) {
    if (r.pin_id && (r.destination_url || r.image_url)) hubCatalogLookup.set(String(r.pin_id), r);
  }
  for (const r of archivePins) {
    if (r.pin_id && (r.destination_url || r.link || r.image_url) && !hubCatalogLookup.has(String(r.pin_id))) {
      hubCatalogLookup.set(String(r.pin_id), r);
    }
  }

  for (const dp of displacedPins) {
    const pid = String(dp.pin_id || '').trim();
    const cat = hubCatalogLookup.get(pid);
    if (cat) {
      dp.title = dp.title || cat.title || '';
      dp.destination_url = dp.destination_url || cat.destination_url || cat.link || '';
      dp.image_url = dp.image_url || cat.image_url || '';
      dp.creator_username = dp.creator_username || cat.creator_username || '';
      dp.board_name = dp.board_name || cat.board_name || '';
      dp.created_at_pinterest = dp.created_at_pinterest || cat.created_at_pinterest || null;
    }
  }

  // [INVARIANT: ZERO-HUB-SNAPSHOTS] [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  // Hydrate displaced pins lacking creative metadata from Shards / D1 in bounded parallel batches
  const missingDisplacedPids = new Set();
  for (const dp of displacedPins) {
    const pid = String(dp.pin_id || '').trim();
    if (!pid) continue;
    const existing = pinsMap.get(pid);
    if ((!existing || (!existing.destination_url && !existing.image_url)) && (!dp.destination_url && !dp.image_url)) {
      missingDisplacedPids.add(pid);
    }
  }

  // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Invariant 9: strictly bound displaced pin shard hydration to top 30 pins
  const MAX_DISPLACED_SHARD_HYDRATION = 30;
  if (missingDisplacedPids.size > 0 && !skipShardHydration) {
    try {
      const sortedMissingPids = displacedPins
        .filter(dp => missingDisplacedPids.has(String(dp.pin_id || '').trim()))
        .sort((a, b) => Number(b.saves || 0) - Number(a.saves || 0))
        .map(dp => String(dp.pin_id).trim());

      const boundedPids = Array.from(new Set(sortedMissingPids)).slice(0, MAX_DISPLACED_SHARD_HYDRATION);
      const rowsToHydrate = boundedPids.map(pid => ({ pin_id: pid }));
      const hydratedRows = await hydrateDisplacedIndexFromShards(sql, rowsToHydrate, env, skipShardHydration);
      const hydratedMap = new Map();
      for (const h of (hydratedRows || [])) {
        if (h && (h.destination_url || h.image_url || h.title)) {
          hydratedMap.set(String(h.pin_id), h);
        }
      }
      for (const r of displacedPins) {
        const pid = String(r.pin_id || '').trim();
        const h = hydratedMap.get(pid);
        if (h) {
          r.title = r.title || h.title || '';
          r.destination_url = r.destination_url || h.destination_url || '';
          r.image_url = r.image_url || h.image_url || '';
          r.creator_username = r.creator_username || h.creator_username || '';
          r.board_name = r.board_name || h.board_name || '';
          r.dominant_color = r.dominant_color || h.dominant_color || null;
          r.visual_annotations = (Array.isArray(r.visual_annotations) && r.visual_annotations.length > 0) ? r.visual_annotations : (h.visual_annotations || []);
          r.created_at_pinterest = r.created_at_pinterest || h.created_at_pinterest || null;
        }
      }
    } catch (hydrateErr) {
      console.warn(`[getDomainDeepDossier] Non-fatal displaced hydration notice for ${cleanDomain}:`, hydrateErr.message);
    }
  }

  for (const r of displacedPins) registerPin(r, 'displaced');

  // Catalog & archive pins enrich metadata for existing pins without polluting ranked_pins or money_urls
  const enrichFromCatalogRow = (r) => {
    const pid = String(r.pin_id || '').trim();
    if (!pid || !pinsMap.has(pid)) return;
    const existing = pinsMap.get(pid);
    if (!existing.title && r.title) existing.title = r.title;
    if (!existing.image_url && r.image_url) existing.image_url = r.image_url;
    if (!existing.created_at_pinterest && r.created_at_pinterest) existing.created_at_pinterest = r.created_at_pinterest;
    if (!existing.creator_username && r.creator_username) existing.creator_username = r.creator_username;
    if (!existing.board_name && r.board_name) existing.board_name = r.board_name;
    if ((!existing.destination_url || existing.clean_slug === '/') && (r.destination_url || r.link)) {
      existing.destination_url = r.destination_url || r.link;
      try {
        const u = new URL(existing.destination_url.startsWith('http') ? existing.destination_url : `https://${existing.destination_url}`);
        existing.clean_slug = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      } catch (_) {}
    }
  };
  for (const r of compPins) enrichFromCatalogRow(r);
  for (const r of archivePins) enrichFromCatalogRow(r);

  // 2. Finalize Pins & Group by Money Article URLs (Pillar 2: Creative Multiplier)
  const urlGroupsMap = new Map();
  const allPins = Array.from(pinsMap.values()).map(p => {
    if (p.creator_username && accountsMap.has(p.creator_username)) {
      const acc = accountsMap.get(p.creator_username);
      acc.pins_count++;
      acc.total_saves += p.saves;
      if (p.best_rank !== null && p.best_rank <= 10) acc.top10_count++;
    }

    // [INVARIANT: CLEAN-MONEY-ARTICLES] An article must represent a genuine content path (clean_slug !== '/') with authentic creative pins
    const hasValidImage = Boolean(p.image_url && p.image_url.trim());
    const isRealArticle = p.clean_slug && p.clean_slug !== '/';

    if (isRealArticle && hasValidImage) {
      const slugKey = p.clean_slug;
      if (!urlGroupsMap.has(slugKey)) {
        urlGroupsMap.set(slugKey, {
          clean_slug: slugKey,
          sample_url: p.destination_url || `https://${cleanDomain}${slugKey}`,
          pins_count: 0,
          total_saves: 0,
          total_repins: 0,
          best_rank: null,
          keywords_set: new Set(),
          pins: [],
          angles_targeted: new Set()
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

      // Detect Marketing Angle for this Pin
      const angleInfo = detectMarketingAngle({
        title: p.title,
        keywords: Array.from(uGroup.keywords_set),
        annotations: p.visual_annotations
      });
      uGroup.angles_targeted.add(angleInfo.angle);

      uGroup.pins.push({
        pin_id: p.pin_id,
        title: p.title,
        image_url: p.image_url,
        saves: p.saves,
        velocity: p.velocity,
        best_rank: p.best_rank,
        creator_username: p.creator_username,
        dominant_color: p.dominant_color,
        visual_annotations: p.visual_annotations,
        created_at_pinterest: p.created_at_pinterest,
        is_vulnerable: p.is_vulnerable,
        vulnerability_score: p.vulnerability_score,
        is_displaced: Boolean(p.is_displaced),
        detected_angle: angleInfo.angle,
        intent_tag: angleInfo.intent_tag,
        badge_color: angleInfo.badge_color
      });
    }

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

  // [INVARIANT: STRICT-VISUAL-PIN-FIDELITY] Every displayed pin must possess an authentic image URL
  const visualPins = allPins.filter(p => Boolean(p.image_url && p.image_url.trim()));

  const moneyUrls = Array.from(urlGroupsMap.values())
    .map(u => {
      const pinDates = u.pins
        .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
        .filter(t => t !== null && isFinite(t));
      const newestPinDate = pinDates.length > 0 ? new Date(Math.max(...pinDates)).toISOString() : null;
      const oldestPinDate = pinDates.length > 0 ? new Date(Math.min(...pinDates)).toISOString() : null;
      const kws = Array.from(u.keywords_set);

      return {
        clean_slug: u.clean_slug,
        sample_url: u.sample_url,
        pins_count: u.pins_count,
        total_saves: u.total_saves,
        total_repins: u.total_repins,
        best_rank: u.best_rank,
        keywords: kws,
        target_keywords: kws,
        created_at_pinterest: newestPinDate,
        newest_pin_date: newestPinDate,
        oldest_pin_date: oldestPinDate,
        angles_targeted: Array.from(u.angles_targeted),
        angle_multiplier: u.angles_targeted.size,
        is_vulnerable: u.pins.some(p => p.is_vulnerable),
        pins: u.pins.sort((a, b) => b.saves - a.saves)
      };
    })
    .sort((a, b) => b.pins_count - a.pins_count || b.total_saves - a.total_saves);

  // 3. Pillar 1: Carpet Bombing & Slot Domination Analysis
  const keywordMonopoly = Array.from(keywordMatrixMap.values())
    .map(k => {
      const uniqueCount = k.unique_urls.size;
      let strategy = 'SINGLE_SLOT';
      let strategyLabel = 'Single Slot';
      if (k.active_slots > 1 && uniqueCount === 1) {
        strategy = 'URL_FLOODING';
        strategyLabel = 'URL Creative Flooding';
      } else if (k.active_slots > 1 && (k.active_slots / Math.max(1, uniqueCount)) >= 1.5) {
        strategy = 'HYBRID_FLOODING';
        strategyLabel = 'Hybrid Domination';
      } else if (uniqueCount > 1) {
        strategy = 'TOPIC_CLUSTER';
        strategyLabel = 'Topic Cluster';
      }

      const sortedSlots = k.slots_detail.sort((a, b) => (a.rank_position || 999) - (b.rank_position || 999) || b.saves - a.saves);
      const topSlot = sortedSlots.reduce((max, s) => s.saves > (max?.saves || 0) ? s : max, sortedSlots[0] || null);

      return {
        keyword_id: k.keyword_id,
        keyword_name: k.keyword_name,
        active_slots: k.active_slots,
        displaced_slots: k.displaced_slots,
        best_rank: k.best_rank,
        ranks: k.ranks.sort((a, b) => a - b),
        total_saves: k.total_saves,
        unique_urls_count: uniqueCount,
        strategy,
        strategy_label: strategyLabel,
        serp_share_pct: Number(((k.active_slots / 50) * 100).toFixed(1)),
        is_decaying_monopoly: k.is_decaying_monopoly,
        top_slot_attribution: topSlot,
        slots: sortedSlots
      };
    })
    .sort((a, b) => b.active_slots - a.active_slots || (a.best_rank || 999) - (b.best_rank || 999));

  // 4. Pillar 4: P2P Sybil Network & Ghost Creators Tracking
  const brandRoot = cleanDomain.split('.')[0].replace(/[^a-z0-9]/g, '');

  // [INVARIANT: SARGABLE-INDEX-SEEK] Rule 9: Query creator_username directly without wrapping indexed column in expressions
  // Sort accounts by activity (pins_count & total_saves) to strictly bound to the true top 50 accounts
  const sortedAccounts = Array.from(accountsMap.values())
    .sort((a, b) => b.pins_count - a.pins_count || b.total_saves - a.total_saves);
  const topAccounts = sortedAccounts.slice(0, 50);

  // Collect both clean and raw database usernames to guarantee exact B-Tree seek across mixed-case entries
  const cleanUsernames = Array.from(new Set(
    topAccounts.flatMap(acc => [acc.username, ...Array.from(acc.raw_usernames || [])]).filter(Boolean)
  ));
  let crossFootprintRows = [];
  if (cleanUsernames.length > 0) {
    try {
      crossFootprintRows = await sql`
        SELECT
          creator_username AS username,
          domain AS cross_domain,
          COUNT(DISTINCT pin_id)::int AS pins_count
        FROM keyword_serp_current
        WHERE creator_username = ANY(${cleanUsernames})
          AND domain IS NOT NULL AND domain <> ''
          AND domain <> ${cleanDomain}
        GROUP BY 1, 2
        ORDER BY 3 DESC
        LIMIT 60;
      `;
    } catch (_) {}
  }

  const crossMap = new Map();
  for (const r of crossFootprintRows) {
    const u = String(r.username || '').replace(/^@+/, '').trim().toLowerCase();
    if (!crossMap.has(u)) crossMap.set(u, []);
    crossMap.get(u).push({ domain: r.cross_domain, pins_count: r.pins_count });
  }

  const accountsList = Array.from(accountsMap.values()).map(acc => {
    const isBrand = acc.username === brandRoot ||
                    acc.username.includes(brandRoot) ||
                    (brandRoot.length > 3 && brandRoot.includes(acc.username)) ||
                    (acc.pins_count / Math.max(1, allPins.length)) >= 0.4;
    const sisterDomains = crossMap.get(acc.username) || [];
    return {
      ...acc,
      role: isBrand ? 'PRIMARY_BRAND' : 'SATELLITE_CREATOR',
      role_label: isBrand ? 'Primary Brand Account' : 'Satellite / Ghost Creator',
      sister_domains: sisterDomains,
      is_sybil_ring: sisterDomains.length > 0
    };
  }).sort((a, b) => (b.role === 'PRIMARY_BRAND' ? 1 : 0) - (a.role === 'PRIMARY_BRAND' ? 1 : 0) || b.total_saves - a.total_saves);

  // 5. Pillar 3: Reverse-Engineered Visual DNA Profile
  const tagFreq = new Map();
  const colorFreq = new Map();
  const aspectFreq = new Map();
  const titleWords = new Map();
  const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'on', 'easy', 'recipe', 'recipes', 'how', 'make', 'best', 'that']);

  for (const p of allPins) {
    if (Array.isArray(p.visual_annotations)) {
      for (const t of p.visual_annotations) {
        // [INVARIANT: DEFENSIVE-ANNOTATIONS-UNPACKING] Prevent [object Object] poisoning from raw objects
        const rawTag = (typeof t === 'object' && t !== null) 
          ? (t.name || t.tag || t.label || t.display_label || '') 
          : String(t || '');
        const cleanTag = rawTag.trim();
        if (cleanTag && cleanTag !== '[object Object]') {
          tagFreq.set(cleanTag, (tagFreq.get(cleanTag) || 0) + 1);
        }
      }
    }
    const c = (p.dominant_color || '').trim().toLowerCase();
    if (c && c.startsWith('#')) {
      colorFreq.set(c, (colorFreq.get(c) || 0) + 1);
    }
    const ar = p.aspect_ratio || '2:3';
    aspectFreq.set(ar, (aspectFreq.get(ar) || 0) + 1);

    const words = String(p.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      titleWords.set(w, (titleWords.get(w) || 0) + 1);
    }
  }

  const visualTagsCloud = Array.from(tagFreq.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const totalColorPins = Math.max(1, allPins.length);
  const dominantColorsPalette = Array.from(colorFreq.entries())
    .map(([color, count]) => ({
      color,
      count,
      percentage: Math.round((count / totalColorPins) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topTitleKeywords = Array.from(titleWords.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const visualDna = {
    visual_tags_cloud: visualTagsCloud,
    dominant_colors_palette: dominantColorsPalette,
    aspect_ratios: Object.fromEntries(aspectFreq),
    top_title_keywords: topTitleKeywords
  };

  return {
    success: true,
    domain: cleanDomain,
    age_info: ageInfo,
    ad_info: adInfo,
    needs_age_enrichment: Boolean(ageInfo?.needs_enrichment || ageInfo?.lookup_status === 'pending'),
    needs_ad_enrichment: Boolean(adInfo?.needs_enrichment || adInfo?.ads_txt_status === 'pending'),
    summary: {
      total_pins: allPins.length,
      all_catalog_pins_count: allPins.length,
      visual_pins_count: visualPins.length,
      active_pins_count: serpPins.length,
      displaced_pins_count: displacedPins.length,
      unique_urls: moneyUrls.length,
      pins_per_url: moneyUrls.length > 0 ? Number((allPins.length / moneyUrls.length).toFixed(2)) : 1,
      ranked_keywords_count: keywordMonopoly.length,
      total_saves: allPins.reduce((acc, p) => acc + p.saves, 0),
      accounts_count: accountsMap.size,
      vulnerable_pins_count: allPins.filter(p => p.is_vulnerable).length,
      decaying_monopoly_count: keywordMonopoly.filter(k => k.is_decaying_monopoly).length,
      sybil_accounts_count: accountsList.filter(a => a.role === 'SATELLITE_CREATOR').length,
      sister_domains_count: new Set(crossFootprintRows.map(r => r.cross_domain)).size
    },
    ranked_pins: visualPins,
    money_urls: moneyUrls,
    keyword_monopoly: keywordMonopoly,
    accounts: accountsList,
    visual_dna: visualDna
  };
}

/**
 * Pillar 6: Generates the One-Click Arbitrage Attack Blueprint
 */
export async function generateDomainArbitrageBlueprint(sql, rawDomain) {
  const dossier = await getDomainDeepDossier(sql, rawDomain);
  const cleanDomain = dossier.domain;

  // 1. Top 5 Target Articles to Clone & Outrank
  const topArticles = (dossier.money_urls || [])
    .slice(0, 5)
    .map((art, idx) => {
      const primaryKeywords = (art.keywords || []).slice(0, 3);
      const angles = (art.angles_targeted && art.angles_targeted.length > 0)
        ? art.angles_targeted
        : ['Classic Recipe'];

      return {
        priority: idx + 1,
        slug: art.clean_slug,
        sample_url: art.sample_url,
        total_saves: art.total_saves,
        creative_pins_count: art.pins_count,
        best_rank: art.best_rank,
        is_vulnerable: Boolean(art.is_vulnerable),
        target_keywords: primaryKeywords,
        angles_used_by_competitor: angles,
        recommended_counter_angles: [
          'Quick 15-Min Prep Angle',
          'Diet/Keto/Low-Carb Modification Angle',
          'Budget-Friendly Family Meal-Prep Angle'
        ]
      };
    });

  // 2. High-Converting Title Formula Blueprints
  const topKw = dossier.visual_dna?.top_title_keywords?.slice(0, 3).map(k => k.word) || ['Chicken', 'Dinner', 'Easy'];
  const titleBlueprints = [
    `The Best ${topKw[0] ? topKw[0].charAt(0).toUpperCase() + topKw[0].slice(1) : 'Recipe'} (Ready In Under 20 Minutes)`,
    `Ultra-Crispy ${topKw.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} That Everyone Will Love`,
    `5 Easy ${topKw[0] ? topKw[0].charAt(0).toUpperCase() + topKw[0].slice(1) : 'Meal'} Ideas For Weeknight Dinners`
  ];

  // 3. Visual DNA Tags to Feed Pinterest Computer Vision Algorithm
  const visualTagsChecklist = (dossier.visual_dna?.visual_tags_cloud || []).slice(0, 10);

  // 4. Color Strategy
  const colorPalette = (dossier.visual_dna?.dominant_colors_palette || []).slice(0, 4);

  // 5. Build Markdown Blueprint
  const mdLines = [
    `# ⚡ Tactical Arbitrage Attack Blueprint: ${cleanDomain}`,
    `Generated on: ${new Date().toISOString().slice(0, 10)} | Domain Age: ${dossier.age_info?.age_years != null ? dossier.age_info.age_years + 'y' : 'Unknown'} | Ad Network: ${dossier.ad_info?.current_ad_network || 'Direct'}`,
    '',
    `## 📊 Executive Threat Assessment`,
    `- **Total Tracked Pins:** ${dossier.summary.total_pins} pins across ${dossier.summary.unique_urls} articles`,
    `- **Creative Multiplier:** ${dossier.summary.pins_per_url}x pins per article`,
    `- **Decaying Monopoly Slots:** ${dossier.summary.decaying_monopoly_count} vulnerable keywords ready for fresh pin takeover`,
    `- **P2P Creator Network:** ${dossier.summary.accounts_count} creators (${dossier.summary.sybil_accounts_count} satellite/sybil accounts)`,
    '',
    `## 🎯 Top 5 Target Articles to Clone & Outrank`,
    '| # | Article Slug | Saves | Best Rank | Vulnerability | Primary Keywords | Recommended Angles |',
    '|---|---|---|---|---|---|---|'
  ];

  for (const a of topArticles) {
    const vulnBadge = a.is_vulnerable ? '⚡ CRITICAL VULNERABLE' : 'Normal';
    const kwStr = a.target_keywords.join(', ') || '—';
    const angleStr = a.angles_used_by_competitor.join(', ') || 'Classic';
    mdLines.push(`| ${a.priority} | \`${a.slug}\` | ${Number(a.total_saves).toLocaleString()} | #${a.best_rank || '—'} | ${vulnBadge} | ${kwStr} | ${angleStr} |`);
  }

  mdLines.push('', `## 🧬 Pinterest Computer Vision Tags to Include (Alt-Text & Image Elements)`);
  mdLines.push('Include these visual concepts in your image pins so Pinterest AI matches your pin with the #1 slot:');
  for (const t of visualTagsChecklist) {
    mdLines.push(`- **${t.tag}** (Detected ${t.count}x in competitor top pins)`);
  }

  mdLines.push('', `## 🎨 Winning Color Palette`);
  for (const c of colorPalette) {
    mdLines.push(`- \`${c.color}\` (${c.percentage}% of competitor pins)`);
  }

  mdLines.push('', `## ✍️ High-Converting Title Formulas`);
  for (const t of titleBlueprints) {
    mdLines.push(`1. \`${t}\``);
  }

  mdLines.push('', `## 🚀 Recommended Deployment Plan`);
  mdLines.push('1. Write 1 in-depth comprehensive guide covering the top 5 article topics above.');
  mdLines.push('2. Deploy **3 distinct creative pin variations** per article (Multiplier: 3.0x):');
  mdLines.push('   - Pin 1: Quick & 15-Minute Angle targeting speed-conscious searchers.');
  mdLines.push('   - Pin 2: Diet/Keto/Low-Carb Modification Angle targeting health searchers.');
  mdLines.push('   - Pin 3: Family/Budget/One-Pot Angle targeting household cooks.');
  mdLines.push('3. Launch pins using high-contrast images embedding the visual tags above to steal rank within 72 hours.');

  return {
    success: true,
    domain: cleanDomain,
    generated_at: new Date().toISOString(),
    top_articles: topArticles,
    title_blueprints: titleBlueprints,
    visual_tags_checklist: visualTagsChecklist,
    color_palette: colorPalette,
    recommended_multiplier: 3,
    markdown_blueprint: mdLines.join('\n')
  };
}
