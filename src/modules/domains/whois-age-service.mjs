/**
 * src/modules/domains/whois-age-service.mjs
 *
 * Domain Age & WHOIS Registration Resolver (Authoritative RDAP, Socket WHOIS, Domainee, crt.sh)
 * and Batch Enrichment Pipeline.
 */

import { sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { escapeSqlWildcards, chunkArray } from '../../utils.mjs';
import {
  IGNORED_INTERNAL_DOMAINS,
  ECOMMERCE_AND_SOCIAL_DOMAINS,
  normalizeCleanDomain
} from './domain-constants.mjs';

/**
 * Escapes SQL LIKE/ILIKE wildcard characters (%, _, \) in user search strings
 */
export function escapeSqlLike(str) {
  if (!str || typeof str !== 'string') return '';
  return escapeSqlWildcards(str.trim().toLowerCase());
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
        SELECT DISTINCT ump.clean_domain
        FROM universal_master_pins ump
        WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
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
        ump.clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(ksp.rank_position, ksp.last_known_rank, 50))))::bigint AS visibility_score,
        SUM(COALESCE(ump.save_count, 0))::bigint AS total_saves
      FROM universal_master_pins ump
      LEFT JOIN keyword_serp_positions ksp ON ksp.pin_id = ump.pin_id
      WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
      GROUP BY ump.clean_domain
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
  const chunks = chunkArray(domainList, conc);
  for (let idx = 0; idx < chunks.length; idx++) {
    const slice = chunks[idx];
    const chunkPromises = slice.map(async (dom) => {
      try {
        return await fetchAndCacheDomainAge(sql, dom, { forceRefresh });
      } catch (_) {
        return { domain: dom, lookup_status: 'failed', age_years: null };
      }
    });
    const batchOutputs = await Promise.all(chunkPromises);
    results.push(...batchOutputs.filter(Boolean));
    if (idx + 1 < chunks.length) {
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
