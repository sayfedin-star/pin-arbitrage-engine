/**
 * src/modules/domains/whois-age-service.mjs
 *
 * Domain Age & WHOIS Registration Resolver (Authoritative RDAP, Socket WHOIS, Domainee, crt.sh)
 * and Batch Enrichment Pipeline.
 */

import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { sleep, randomJitterMs } from '../../core/pinterest/index.mjs';
import { escapeSqlWildcards, chunkArray } from '../../utils.mjs';
import { connectSafeTcpSocket, safeExternalFetch } from '../../lib/net-guard.mjs';
import { redactSecrets } from '../../http/security-and-response.mjs';
import { normalizeCleanDomain } from './domain-constants.mjs';

export const CRT_SH_MAX_BYTES = 2 * 1024 * 1024; // 2 MB hard cap for crt.sh JSON responses

/**
 * Reads and parses a JSON HTTP response while enforcing a strict maximum byte limit
 * before calling `JSON.parse()` so multi-megabyte `crt.sh` payloads cannot spike heap memory.
 *
 * @param {Response} res
 * @param {number} [maxBytes=CRT_SH_MAX_BYTES]
 * @returns {Promise<any>}
 */
export async function readBoundedJsonResponse(res, maxBytes = CRT_SH_MAX_BYTES) {
  const limit = Math.max(1024, Number(maxBytes) || CRT_SH_MAX_BYTES);
  const contentLengthHeader = typeof res?.headers?.get === 'function'
    ? res.headers.get('content-length')
    : res?.headers?.['content-length'];
  const declaredLen = contentLengthHeader != null ? Number(contentLengthHeader) : NaN;
  if (Number.isFinite(declaredLen) && declaredLen > limit) {
    if (res?.body && typeof res.body.cancel === 'function') {
      await res.body.cancel().catch(() => {});
    }
    const err = new Error(`Response Content-Length (${declaredLen} bytes) exceeds ${limit}-byte cap.`);
    err.code = 'RESPONSE_TOO_LARGE';
    throw err;
  }

  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let totalBytes = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > limit) {
          await reader.cancel().catch(() => {});
          const err = new Error(`Streaming response exceeded ${limit}-byte cap (received > ${totalBytes} bytes).`);
          err.code = 'RESPONSE_TOO_LARGE';
          throw err;
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text);
    } finally {
      reader.releaseLock?.();
    }
  }

  if (typeof res?.text === 'function') {
    const text = await res.text();
    const byteLen = Buffer.byteLength(text, 'utf8');
    if (byteLen > limit) {
      const err = new Error(`Response body (${byteLen} bytes) exceeds ${limit}-byte cap.`);
      err.code = 'RESPONSE_TOO_LARGE';
      throw err;
    }
    return JSON.parse(text);
  }

  return await res.json();
}

function tagDatabaseError(err) {
  const wrapped = err instanceof Error ? err : new Error(String(err));
  wrapped.isDbError = true;
  return wrapped;
}

/**
 * Escapes SQL LIKE/ILIKE wildcard characters (%, _, \) in user search strings
 */
export function escapeSqlLike(str) {
  if (!str || typeof str !== 'string') return '';
  return escapeSqlWildcards(str.trim().toLowerCase());
}

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

/**
 * Direct Socket WHOIS for ccTLDs (.me, .co, .io, .ai, etc.)
 * Connects via SSRF-guarded `connectSafeTcpSocket` directly to the verified IP on port 43.
 */
export async function queryWhoisSocket(cleanDomain, socketOpts = {}) {
  try {
    if (!cleanDomain || typeof net.createConnection !== 'function') return null;

    const tld = cleanDomain.split('.').pop().toLowerCase();
    if (!/^[a-z]{2,24}$/.test(tld)) return null;

    const host = WHOIS_SERVERS[tld] || `whois.nic.${tld}`;
    const MAX_BUFFER_BYTES = 64 * 1024; // 64KB protection ceiling
    const socket = await connectSafeTcpSocket({
      host,
      port: 43,
      timeoutMs: 3500,
      ...socketOpts
    });

    return await new Promise((resolve) => {
      let resolved = false;
      let timer = null;
      const decoder = new StringDecoder('utf8');
      let buffer = '';

      const done = (result) => {
        if (resolved) return;
        resolved = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          socket.removeAllListeners();
          socket.destroy();
        } catch (_) {}
        resolve(result);
      };

      timer = setTimeout(() => {
        done(buffer || null);
      }, 3500);
      timer?.unref?.();

      socket.on('data', (chunk) => {
        if (buffer.length < MAX_BUFFER_BYTES) {
          buffer += decoder.write(chunk);
          if (buffer.length >= MAX_BUFFER_BYTES) {
            done(buffer.slice(0, MAX_BUFFER_BYTES));
          }
        }
      });

      socket.on('end', () => {
        buffer += decoder.end();
        done(buffer || null);
      });

      socket.on('error', () => {
        done(null);
      });

      try {
        socket.write(`${cleanDomain}\r\n`);
      } catch (_) {
        done(null);
      }
    });
  } catch (_) {
    return null;
  }
}

/**
 * HTTPS RDAP Domain Age & Registrar Lookup (`https://rdap.org/domain/<domain>`).
 * Guarded against DNS rebinding and unsafe cross-origin redirects via `safeExternalFetch`.
 */
export async function queryWhoisHttpsRdap(cleanDomain) {
  try {
    const res = await safeExternalFetch(`https://rdap.org/domain/${encodeURIComponent(cleanDomain)}`, {
      headers: {
        'Accept': 'application/rdap+json, application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
      },
      timeoutMs: 6000,
      maxRedirects: 5
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
export async function fetchAndCacheDomainAge(sql, rawDomain, { forceRefresh = false, fastPath = false, throwOnDbError = false } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) return null;

  if (!forceRefresh) {
    try {
      const referenceTime = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
      const [cached] = await sql`
        SELECT
          domain,
          domain_created_at AS registered_at,
          updated_at_whois,
          domain_expires_at AS expires_at,
          lookup_source,
          COALESCE(NULLIF(lookup_status, 'pending'), NULLIF(age_status, 'unchecked'), lookup_status) AS lookup_status,
          age_status,
          whois_checked_at AS checked_at,
          CASE
            WHEN domain_created_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - domain_created_at)) / 86400))::int
            ELSE age_days
          END AS age_days,
          CASE
            WHEN domain_created_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (${referenceTime}::timestamptz - domain_created_at)) / 31557600)::numeric, 2)
            ELSE age_years
          END AS age_years
        FROM domain_intelligence_rollup
        WHERE domain = ${cleanDomain}
          AND (
            lookup_status = 'resolved'
            OR age_status = 'resolved'
            OR ((lookup_status = 'failed' OR age_status = 'failed') AND COALESCE(whois_checked_at, updated_at) > ${referenceTime}::timestamptz - INTERVAL '3 days')
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
    } catch (dbReadErr) {
      console.error(`[whois-age-service] DB cache read failed for ${cleanDomain}:`, dbReadErr?.message || dbReadErr);
      if (throwOnDbError) {
        throw tagDatabaseError(dbReadErr);
      }
    }
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
      const rdapRes = await safeExternalFetch(directRdapUrl, {
        headers: {
          'Accept': 'application/rdap+json, application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        timeoutMs: 6000,
        maxRedirects: 5
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
      const res = await safeExternalFetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        timeoutMs: 6000,
        maxRedirects: 4
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
    let crtRes;
    try {
      const crtUrl = `https://crt.sh/?q=${encodeURIComponent(cleanDomain)}&output=json`;
      crtRes = await safeExternalFetch(crtUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; PinArbitrageEngine/1.0)'
        },
        timeoutMs: 7000,
        maxRedirects: 4
      });
      if (crtRes.ok) {
        const certs = await readBoundedJsonResponse(crtRes, CRT_SH_MAX_BYTES);
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
    } catch (crtErr) {
      if (crtErr?.code === 'RESPONSE_TOO_LARGE') {
        console.warn(`[whois-age-service] Skipped oversized crt.sh payload for ${cleanDomain}: ${crtErr.message}`);
      }
    } finally {
      if (crtRes?.body && !crtRes.bodyUsed) {
        await crtRes.body.cancel().catch(() => {});
      }
    }
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
    const cappedAgeYears = ageYears != null ? Math.min(999.99, Number(ageYears)) : null;
    const [saved] = await sql`
      WITH pin_cnt AS (
        SELECT COUNT(*)::int AS cnt
        FROM universal_master_pins
        WHERE clean_domain = ${cleanDomain}
      ),
      eligible AS (
        SELECT pc.cnt
        FROM pin_cnt pc
        WHERE pc.cnt > 0
           OR EXISTS (SELECT 1 FROM domain_intelligence_rollup WHERE domain = ${cleanDomain})
           OR EXISTS (SELECT 1 FROM folder_pinned_domains WHERE domain = ${cleanDomain})
      )
      INSERT INTO domain_intelligence_rollup (
        domain, total_pins, domain_created_at, updated_at_whois, domain_expires_at,
        age_days, age_years, lookup_source, lookup_status, age_status, whois_checked_at,
        refreshed_at, updated_at
      )
      SELECT
        ${cleanDomain},
        GREATEST(0, e.cnt),
        ${isValidCreated ? parsedCreated.toISOString() : null},
        ${parsedUpdated},
        ${parsedExpires},
        ${ageDays},
        ${cappedAgeYears},
        ${source},
        ${status},
        ${status},
        NOW(),
        NOW(),
        NOW()
      FROM eligible e
      ON CONFLICT (domain) DO UPDATE SET
        domain_created_at = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.domain_created_at ELSE domain_intelligence_rollup.domain_created_at END,
        updated_at_whois = COALESCE(EXCLUDED.updated_at_whois, domain_intelligence_rollup.updated_at_whois),
        domain_expires_at = COALESCE(EXCLUDED.domain_expires_at, domain_intelligence_rollup.domain_expires_at),
        age_days = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.age_days ELSE domain_intelligence_rollup.age_days END,
        age_years = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.age_years ELSE domain_intelligence_rollup.age_years END,
        lookup_source = CASE WHEN EXCLUDED.lookup_status = 'resolved' THEN EXCLUDED.lookup_source ELSE domain_intelligence_rollup.lookup_source END,
        lookup_status = CASE
          WHEN EXCLUDED.lookup_status = 'resolved' THEN 'resolved'
          WHEN domain_intelligence_rollup.lookup_status = 'resolved' OR domain_intelligence_rollup.age_status = 'resolved' THEN 'resolved'
          ELSE EXCLUDED.lookup_status
        END,
        age_status = CASE
          WHEN EXCLUDED.age_status = 'resolved' THEN 'resolved'
          WHEN domain_intelligence_rollup.age_status = 'resolved' OR domain_intelligence_rollup.lookup_status = 'resolved' THEN 'resolved'
          ELSE EXCLUDED.age_status
        END,
        whois_checked_at = NOW(),
        updated_at = NOW()
      RETURNING
        domain,
        domain_created_at AS registered_at,
        updated_at_whois,
        domain_expires_at AS expires_at,
        lookup_source,
        lookup_status,
        age_status,
        whois_checked_at AS checked_at,
        CASE
          WHEN domain_created_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - domain_created_at)) / 86400))::int
          ELSE age_days
        END AS age_days,
        CASE
          WHEN domain_created_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (NOW() - domain_created_at)) / 31557600)::numeric, 2)
          ELSE age_years
        END AS age_years;
    `;

    if (saved) {
      return {
        ...saved,
        age_days: saved.age_days != null ? Number(saved.age_days) : null,
        age_years: saved.age_years != null ? Number(saved.age_years) : null
      };
    }

    return {
      domain: cleanDomain,
      registered_at: isValidCreated ? parsedCreated.toISOString() : null,
      updated_at_whois: parsedUpdated,
      expires_at: parsedExpires,
      age_days: ageDays,
      age_years: ageYears,
      lookup_source: source,
      lookup_status: status,
      age_status: status
    };
  } catch (dbWriteErr) {
    console.error(`[whois-age-service] DB persist failed for ${cleanDomain}:`, dbWriteErr?.message || dbWriteErr);
    throw tagDatabaseError(dbWriteErr);
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
      FROM domain_intelligence_rollup
      WHERE domain <> 'Uploaded by user'
        AND COALESCE(age_status, '') <> 'organic_unlinked';
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
      WITH valid_domains AS (
        SELECT DISTINCT ump.clean_domain
        FROM universal_master_pins ump
        WHERE ump.clean_domain IS NOT NULL
          AND ump.clean_domain <> ''
          AND ump.clean_domain LIKE '%.%'
          AND ump.clean_domain NOT LIKE '% %'
          AND LENGTH(ump.clean_domain) >= 4
      )
      SELECT
        COUNT(*)::int AS total_domains,
        COUNT(dir.domain) FILTER (WHERE dir.age_status IN ('resolved', 'failed') OR dir.lookup_status IN ('resolved', 'failed') OR dir.age_days IS NOT NULL)::int AS checked_domains,
        COUNT(dir.domain) FILTER (WHERE dir.age_status = 'resolved' OR dir.lookup_status = 'resolved' OR (COALESCE(dir.age_status, '') <> 'failed' AND dir.age_days IS NOT NULL))::int AS resolved_domains,
        COUNT(dir.domain) FILTER (WHERE dir.age_status = 'failed' OR (dir.age_status IS DISTINCT FROM 'resolved' AND dir.lookup_status = 'failed'))::int AS failed_domains,
        (COUNT(*) - COUNT(dir.domain) FILTER (WHERE dir.age_status IN ('resolved', 'failed') OR dir.lookup_status IN ('resolved', 'failed') OR dir.age_days IS NOT NULL))::int AS unchecked_domains,
        ROUND((COUNT(dir.domain) FILTER (WHERE dir.age_status IN ('resolved', 'failed') OR dir.lookup_status IN ('resolved', 'failed') OR dir.age_days IS NOT NULL)::numeric / GREATEST(1, COUNT(*))) * 100, 1) AS percent_complete
      FROM valid_domains vd
      LEFT JOIN domain_intelligence_rollup dir ON dir.domain = vd.clean_domain;
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
      error: redactSecrets(err?.message || 'Failed to load enrichment stats')
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
      GROUP BY clean_domain
    )
    SELECT agg.domain
    FROM aggregated agg
    LEFT JOIN domain_intelligence_rollup dir ON dir.domain = agg.domain
    WHERE (
      ${forceRefresh} = TRUE
      OR dir.domain IS NULL
      OR (
        COALESCE(dir.lookup_status, 'pending') NOT IN ('resolved', 'failed')
        AND COALESCE(dir.age_status, 'unchecked') NOT IN ('resolved', 'failed')
        AND dir.age_days IS NULL
      )
      OR (
        (dir.lookup_status = 'failed' OR dir.age_status = 'failed')
        AND dir.age_days IS NULL
        AND COALESCE(dir.whois_checked_at, dir.updated_at) < NOW() - INTERVAL '30 days'
      )
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
        return await fetchAndCacheDomainAge(sql, dom, { forceRefresh, throwOnDbError: true });
      } catch (err) {
        if (err?.isDbError) {
          console.error(`[whois-age-service] Fatal DB error during batch enrichment of ${dom}:`, err?.message || err);
          throw err;
        }
        console.warn(`[whois-age-service] External lookup error for ${dom}:`, err?.message || err);
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
