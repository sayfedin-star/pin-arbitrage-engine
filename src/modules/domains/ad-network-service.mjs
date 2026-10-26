/**
 * src/modules/domains/ad-network-service.mjs
 *
 * Dedicated Ad Network & Monetization Intelligence Engine
 *
 * Features:
 * - Detects publisher ad networks: Raptive (CafeMedia/AdThrive), Mediavine, Journey by Mediavine,
 *   Ezoic, Monumetric, SheMedia, Freestar, Playwire, Snigel, AdSense, and Affiliate-only.
 * - Historical Switch Tracking: Identifies when a publisher migrates or upgrades from one network
 *   to another (e.g., Ezoic ➔ Journey ➔ Mediavine) and maintains an immutable audit log.
 * - Resilient streaming ads.txt fetcher with 128KB bounds and 3500ms AbortSignal timeouts.
 * - Fully isolated non-destructive module targeting Neon Serverless Postgres.
 */

import { sleep, randomJitterMs } from '../../../scripts/lib/pinterest.mjs';
import {
  normalizeCleanDomain,
  IGNORED_INTERNAL_DOMAINS,
  ECOMMERCE_AND_SOCIAL_DOMAINS
} from './service.mjs';

export const KNOWN_AD_NETWORKS = {
  RAPTIVE: 'raptive',
  MEDIAVINE: 'mediavine',
  JOURNEY: 'journey',
  EZOIC: 'ezoic',
  HBAGENCY: 'hbagency',
  MONUMETRIC: 'monumetric',
  SHEMEDIA: 'shemedia',
  FREESTAR: 'freestar',
  PLAYWIRE: 'playwire',
  SNIGEL: 'snigel',
  ADSENSE: 'adsense',
  AFFILIATE_ONLY: 'affiliate_only',
  PROTECTED: 'protected',
  FAILED: 'failed'
};

export const AD_NETWORK_DISPLAY_CONFIG = {
  [KNOWN_AD_NETWORKS.RAPTIVE]: {
    label: 'Raptive',
    badge: '💎 Raptive',
    icon: '💎',
    colorClasses: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
  },
  [KNOWN_AD_NETWORKS.MEDIAVINE]: {
    label: 'Mediavine',
    badge: '🍇 Mediavine',
    icon: '🍇',
    colorClasses: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  },
  [KNOWN_AD_NETWORKS.HBAGENCY]: {
    label: 'HBAgency',
    badge: '⚡ HBAgency',
    icon: '⚡',
    colorClasses: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  },
  [KNOWN_AD_NETWORKS.JOURNEY]: {
    label: 'Journey',
    badge: '🚀 Journey',
    icon: '🚀',
    colorClasses: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
  },
  [KNOWN_AD_NETWORKS.EZOIC]: {
    label: 'Ezoic',
    badge: '⚡ Ezoic',
    icon: '⚡',
    colorClasses: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  },
  [KNOWN_AD_NETWORKS.MONUMETRIC]: {
    label: 'Monumetric',
    badge: '📊 Monumetric',
    icon: '📊',
    colorClasses: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30'
  },
  [KNOWN_AD_NETWORKS.SHEMEDIA]: {
    label: 'SheMedia',
    badge: '🌸 SheMedia',
    icon: '🌸',
    colorClasses: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30'
  },
  [KNOWN_AD_NETWORKS.FREESTAR]: {
    label: 'Freestar',
    badge: '⭐ Freestar',
    icon: '⭐',
    colorClasses: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30'
  },
  [KNOWN_AD_NETWORKS.PLAYWIRE]: {
    label: 'Playwire',
    badge: '🎮 Playwire',
    icon: '🎮',
    colorClasses: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30'
  },
  [KNOWN_AD_NETWORKS.SNIGEL]: {
    label: 'Snigel',
    badge: '🐌 Snigel',
    icon: '🐌',
    colorClasses: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30'
  },
  [KNOWN_AD_NETWORKS.ADSENSE]: {
    label: 'AdSense',
    badge: '🟡 AdSense',
    icon: '🟡',
    colorClasses: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
  },
  [KNOWN_AD_NETWORKS.AFFILIATE_ONLY]: {
    label: 'Affiliate Only',
    badge: '🛒 Affiliate Only',
    icon: '🛒',
    colorClasses: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
  },
  [KNOWN_AD_NETWORKS.PROTECTED]: {
    label: 'Protected',
    badge: '🛡️ Cloudflare Bot Shield',
    icon: '🛡️',
    colorClasses: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
  },
  [KNOWN_AD_NETWORKS.FAILED]: {
    label: 'Unchecked / Failed',
    badge: '❓ Unchecked',
    icon: '❓',
    colorClasses: 'bg-slate-400/10 text-slate-500 border-slate-300 dark:border-slate-700'
  }
};

/**
 * Parses ads.txt content according to IAB OpenRTB specs and identifies primary ad manager.
 */
export function parseAdsTxtContent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      network: KNOWN_AD_NETWORKS.AFFILIATE_ONLY,
      manager_domain: null,
      primary_pub_id: null,
      raw_header_snippet: null
    };
  }

  const lines = rawText.split('\n');
  const cleanLines = [];
  let headerSnippet = '';

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const l = lines[i].trim();
    if (l.startsWith('#')) {
      headerSnippet += (headerSnippet ? ' | ' : '') + l.replace(/^#+\s*/, '');
    }
  }

  const managerDomainsFound = new Set();
  const directPubIds = [];
  let hasAdSense = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    // Check managerdomain= parameter (IAB Tech Lab standard)
    if (lower.startsWith('managerdomain=')) {
      const mDom = lower.split('=')[1]?.trim()?.split(',')[0]?.split('#')[0]?.trim();
      if (mDom) managerDomainsFound.add(mDom);
    }

    // Comments often declare managers: # Mediavine Ads.txt, # Raptive Ads.txt, # Ezoic
    if (lower.includes('journeymv.com') || lower.includes('journey by mediavine')) {
      managerDomainsFound.add('journeymv.com');
    }
    if (lower.includes('mediavine.com') || lower.includes('mediavine ads.txt')) {
      managerDomainsFound.add('mediavine.com');
    }
    if (lower.includes('cafemedia.com') || lower.includes('raptive.com') || lower.includes('adthrive.com')) {
      managerDomainsFound.add('cafemedia.com');
    }
    if (lower.includes('ezoic.com') || lower.includes('ezoic ads.txt')) {
      managerDomainsFound.add('ezoic.com');
    }
    if (lower.includes('thebloggernetwork.com') || lower.includes('monumetric.com')) {
      managerDomainsFound.add('monumetric.com');
    }
    if (lower.includes('shemedia.com')) {
      managerDomainsFound.add('shemedia.com');
    }
    if (lower.includes('freestar.com') || lower.includes('freestar.io')) {
      managerDomainsFound.add('freestar.com');
    }
    if (lower.includes('playwire.com') || lower.includes('intergi.com')) {
      managerDomainsFound.add('playwire.com');
    }
    if (lower.includes('snigelweb.com') || lower.includes('snigel.com')) {
      managerDomainsFound.add('snigel.com');
    }
    if (lower.includes('hbagency.it') || lower.includes('hbagency.com') || lower.includes('hbagency')) {
      managerDomainsFound.add('hbagency.it');
    }

    if (!trimmed.startsWith('#')) {
      cleanLines.push(trimmed);
      const parts = trimmed.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const exchange = parts[0].toLowerCase();
        const pubId = parts[1];
        const rel = parts[2]?.toUpperCase();

        if (exchange === 'google.com' && pubId.startsWith('pub-')) {
          hasAdSense = true;
          if (rel === 'DIRECT') {
            directPubIds.push(pubId);
          }
        }
      }
    }
  }

  // Precedence Resolution
  // 1. Journey by Mediavine (explicit sub-network)
  if (managerDomainsFound.has('journeymv.com')) {
    return {
      network: KNOWN_AD_NETWORKS.JOURNEY,
      manager_domain: 'journeymv.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Journey by Mediavine'
    };
  }

  // 2. Mediavine
  if (managerDomainsFound.has('mediavine.com')) {
    return {
      network: KNOWN_AD_NETWORKS.MEDIAVINE,
      manager_domain: 'mediavine.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Mediavine Publisher Network'
    };
  }

  // 3. Raptive (CafeMedia / AdThrive)
  if (managerDomainsFound.has('cafemedia.com') || managerDomainsFound.has('raptive.com') || managerDomainsFound.has('adthrive.com')) {
    return {
      network: KNOWN_AD_NETWORKS.RAPTIVE,
      manager_domain: 'cafemedia.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Raptive / CafeMedia'
    };
  }

  // 4. Ezoic
  if (managerDomainsFound.has('ezoic.com')) {
    return {
      network: KNOWN_AD_NETWORKS.EZOIC,
      manager_domain: 'ezoic.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Ezoic Ad Partner'
    };
  }

  // 5. Monumetric
  if (managerDomainsFound.has('monumetric.com') || managerDomainsFound.has('thebloggernetwork.com')) {
    return {
      network: KNOWN_AD_NETWORKS.MONUMETRIC,
      manager_domain: 'monumetric.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Monumetric'
    };
  }

  // 6. SheMedia
  if (managerDomainsFound.has('shemedia.com')) {
    return {
      network: KNOWN_AD_NETWORKS.SHEMEDIA,
      manager_domain: 'shemedia.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'SheMedia Partner Network'
    };
  }

  // 7. Freestar
  if (managerDomainsFound.has('freestar.com') || managerDomainsFound.has('freestar.io')) {
    return {
      network: KNOWN_AD_NETWORKS.FREESTAR,
      manager_domain: 'freestar.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Freestar'
    };
  }

  // 8. Playwire
  if (managerDomainsFound.has('playwire.com')) {
    return {
      network: KNOWN_AD_NETWORKS.PLAYWIRE,
      manager_domain: 'playwire.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Playwire Media'
    };
  }

  // 9. Snigel
  if (managerDomainsFound.has('snigel.com')) {
    return {
      network: KNOWN_AD_NETWORKS.SNIGEL,
      manager_domain: 'snigel.com',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Snigel AdEngine'
    };
  }

  // 10. HBAgency Header Bidding
  if (managerDomainsFound.has('hbagency.it') || managerDomainsFound.has('hbagency.com') || managerDomainsFound.has('hbagency')) {
    return {
      network: KNOWN_AD_NETWORKS.HBAGENCY,
      manager_domain: 'hbagency.it',
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || 'HBAgency Header Bidding'
    };
  }

  // 11. Generic Declared Manager Domain (IAB standard managerdomain=...)
  if (managerDomainsFound.size > 0) {
    const declaredManager = Array.from(managerDomainsFound)[0];
    return {
      network: declaredManager.replace(/\.[a-z]+$/, '').toLowerCase(),
      manager_domain: declaredManager,
      primary_pub_id: directPubIds[0] || null,
      raw_header_snippet: headerSnippet.slice(0, 255) || `Managed by ${declaredManager}`
    };
  }

  // 12. Standalone AdSense (Has DIRECT google.com pub-id without third-party managers)
  if (hasAdSense && directPubIds.length > 0) {
    return {
      network: KNOWN_AD_NETWORKS.ADSENSE,
      manager_domain: 'google.com',
      primary_pub_id: directPubIds[0],
      raw_header_snippet: headerSnippet.slice(0, 255) || 'Google AdSense'
    };
  }

  // 13. Empty or zero-line ads.txt ➔ Affiliate / Direct Courses Only
  if (cleanLines.length === 0) {
    return {
      network: KNOWN_AD_NETWORKS.AFFILIATE_ONLY,
      manager_domain: null,
      primary_pub_id: null,
      raw_header_snippet: 'No Ad Partners Declared (Affiliate / Course Model)'
    };
  }

  // 14. Miscellaneous programmatic setup
  return {
    network: directPubIds.length > 0 ? KNOWN_AD_NETWORKS.ADSENSE : KNOWN_AD_NETWORKS.AFFILIATE_ONLY,
    manager_domain: null,
    primary_pub_id: directPubIds[0] || null,
    raw_header_snippet: headerSnippet.slice(0, 255) || 'Programmatic Display'
  };
}

/**
 * Fetches ads.txt from target domain using streaming reader with 128KB limit and 3500ms timeout
 */
export async function fetchAdsTxt(cleanDomain) {
  if (!cleanDomain) return { ok: false, status: 'failed', content: '' };

  const targetUrl = `https://${cleanDomain}/ads.txt`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/plain, text/html;q=0.9, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  };

  try {
    const res = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(6000),
      redirect: 'follow'
    });

    if (res.status === 403) {
      return { ok: false, status: 'protected', content: '', httpStatus: 403 };
    }

    if (res.status === 404) {
      return { ok: true, status: 'not_found', content: '', httpStatus: 404 };
    }

    if (!res.ok) {
      return { ok: false, status: 'failed', content: '', httpStatus: res.status };
    }

    // Stream up to 128KB to prevent memory exhaustion on giant files
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { ok: true, status: 'resolved', content: text.slice(0, 131072), httpStatus: res.status };
    }

    let chunks = '';
    const decoder = new TextDecoder('utf-8');
    let totalBytes = 0;

    while (totalBytes < 131072) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      chunks += decoder.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch (_) {}

    // Check if response is actually HTML error page rather than ads.txt
    const lowerTrimmed = chunks.trim().toLowerCase();
    if (lowerTrimmed.startsWith('<!doctype html') || lowerTrimmed.startsWith('<html')) {
      if (lowerTrimmed.includes('access denied') || lowerTrimmed.includes('cloudflare') || lowerTrimmed.includes('challenge')) {
        return { ok: false, status: 'protected', content: '', httpStatus: 403 };
      }
      return { ok: true, status: 'not_found', content: '', httpStatus: 404 };
    }

    return { ok: true, status: 'resolved', content: chunks, httpStatus: res.status };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { ok: false, status: 'failed', content: '', error: 'Timeout after 3500ms' };
    }
    return { ok: false, status: 'failed', content: '', error: err.message };
  }
}

/**
 * Ensures network_history is always a parsed Array and not a raw JSON string
 */
export function normalizeMonetizationRecord(record) {
  if (!record) return null;
  let history = [];
  if (Array.isArray(record.network_history)) {
    history = record.network_history;
  } else if (typeof record.network_history === 'string' && record.network_history.trim()) {
    try {
      const parsed = JSON.parse(record.network_history);
      history = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      history = [];
    }
  }

  return {
    ...record,
    network_history: history
  };
}

/**
 * Fetches, detects network, tracks transitions, and caches results into Neon Postgres.
 */
export async function fetchAndCacheDomainAdNetwork(sql, rawDomain, { forceRefresh = false, fastPath = false } = {}) {
  const cleanDomain = normalizeCleanDomain(rawDomain);
  if (!cleanDomain) return null;

  // 1. Check existing record
  const [existing] = await sql`
    SELECT
      domain,
      current_ad_network,
      ad_manager_domain,
      primary_pub_id,
      previous_ad_network,
      switched_at,
      network_history,
      ads_txt_status,
      raw_header_snippet,
      checked_at
    FROM domain_monetization_metadata
    WHERE domain = ${cleanDomain};
  `.catch(() => []);

  // Return cached result if fresh and not forced
  if (
    !forceRefresh &&
    existing &&
    existing.current_ad_network !== 'unchecked' &&
    existing.checked_at &&
    (Date.now() - new Date(existing.checked_at).getTime()) < 14 * 86400000 // 14 days TTL
  ) {
    return normalizeMonetizationRecord(existing);
  }

  // [INVARIANT: FAST-PATH-NON-BLOCKING] Uncached domains return immediately with pending status
  if (fastPath) {
    return {
      domain: cleanDomain,
      current_ad_network: existing?.current_ad_network || 'unchecked',
      ad_manager_domain: existing?.ad_manager_domain || null,
      primary_pub_id: existing?.primary_pub_id || null,
      previous_ad_network: existing?.previous_ad_network || null,
      switched_at: existing?.switched_at || null,
      network_history: normalizeMonetizationRecord(existing)?.network_history || [],
      ads_txt_status: 'pending',
      raw_header_snippet: existing?.raw_header_snippet || null,
      checked_at: existing?.checked_at || null,
      needs_enrichment: true
    };
  }

  // 2. Fetch ads.txt
  const fetchRes = await fetchAdsTxt(cleanDomain);

  let detectedNetwork = KNOWN_AD_NETWORKS.FAILED;
  let managerDomain = null;
  let primaryPubId = null;
  let headerSnippet = null;
  let adsTxtStatus = fetchRes.status;

  if (fetchRes.status === 'protected') {
    detectedNetwork = KNOWN_AD_NETWORKS.PROTECTED;
    headerSnippet = 'Cloudflare Bot Shield / Protected';
  } else if (fetchRes.status === 'not_found') {
    detectedNetwork = KNOWN_AD_NETWORKS.AFFILIATE_ONLY;
    headerSnippet = 'No ads.txt found (HTTP 404)';
  } else if (fetchRes.status === 'resolved') {
    const parsed = parseAdsTxtContent(fetchRes.content);
    detectedNetwork = parsed.network;
    managerDomain = parsed.manager_domain;
    primaryPubId = parsed.primary_pub_id;
    headerSnippet = parsed.raw_header_snippet;
  }

  // 3. Historical Switch Tracking Logic
  let prevNetwork = existing?.previous_ad_network || null;
  let switchedAt = existing?.switched_at || null;
  let networkHistory = [];
  if (Array.isArray(existing?.network_history)) {
    networkHistory = [...existing.network_history];
  } else if (typeof existing?.network_history === 'string' && existing.network_history.trim()) {
    try {
      const parsed = JSON.parse(existing.network_history);
      if (Array.isArray(parsed)) networkHistory = parsed;
    } catch (_) {}
  }

  const oldNetwork = existing?.current_ad_network;
  const isMeaningfulOld = oldNetwork && oldNetwork !== 'unchecked' && oldNetwork !== 'failed' && oldNetwork !== 'protected';
  const isMeaningfulNew = detectedNetwork !== 'unchecked' && detectedNetwork !== 'failed' && detectedNetwork !== 'protected';

  // If a valid transition occurred (e.g. was 'ezoic' and is now 'journey' or 'mediavine')
  if (isMeaningfulOld && isMeaningfulNew && oldNetwork !== detectedNetwork) {
    prevNetwork = oldNetwork;
    switchedAt = new Date().toISOString();
    networkHistory.push({
      from_network: oldNetwork,
      to_network: detectedNetwork,
      switched_at: switchedAt,
      previous_manager: existing.ad_manager_domain || null,
      new_manager: managerDomain || null
    });
  }

  // If new fetch failed or was blocked, preserve previous valid network rather than degrading to 'failed'
  const finalNetwork = (detectedNetwork === KNOWN_AD_NETWORKS.FAILED && isMeaningfulOld)
    ? oldNetwork
    : detectedNetwork;

  try {
    const [saved] = await sql`
      INSERT INTO domain_monetization_metadata (
        domain,
        current_ad_network,
        ad_manager_domain,
        primary_pub_id,
        previous_ad_network,
        switched_at,
        network_history,
        ads_txt_status,
        raw_header_snippet,
        checked_at
      ) VALUES (
        ${cleanDomain},
        ${finalNetwork},
        ${managerDomain},
        ${primaryPubId},
        ${prevNetwork},
        ${switchedAt},
        ${JSON.stringify(networkHistory)}::jsonb,
        ${adsTxtStatus},
        ${headerSnippet},
        NOW()
      )
      ON CONFLICT (domain) DO UPDATE SET
        current_ad_network = EXCLUDED.current_ad_network,
        ad_manager_domain = COALESCE(EXCLUDED.ad_manager_domain, domain_monetization_metadata.ad_manager_domain),
        primary_pub_id = COALESCE(EXCLUDED.primary_pub_id, domain_monetization_metadata.primary_pub_id),
        previous_ad_network = COALESCE(EXCLUDED.previous_ad_network, domain_monetization_metadata.previous_ad_network),
        switched_at = COALESCE(EXCLUDED.switched_at, domain_monetization_metadata.switched_at),
        network_history = EXCLUDED.network_history,
        ads_txt_status = EXCLUDED.ads_txt_status,
        raw_header_snippet = COALESCE(EXCLUDED.raw_header_snippet, domain_monetization_metadata.raw_header_snippet),
        checked_at = NOW()
      RETURNING *;
    `;
    if (saved) {
      // [INVARIANT: SYNC-ENRICHMENT-ROLLUP-ADS] Sync ads.txt monetization directly into domain_intelligence_rollup
      sql`
        UPDATE domain_intelligence_rollup
        SET ad_network = ${saved.current_ad_network || finalNetwork},
            ad_manager_domain = ${saved.ad_manager_domain || managerDomain},
            primary_pub_id = ${saved.primary_pub_id || primaryPubId},
            ads_txt_status = ${saved.ads_txt_status || adsTxtStatus},
            ad_switched_at = ${saved.switched_at ? new Date(saved.switched_at) : (switchedAt ? new Date(switchedAt) : null)},
            previous_ad_network = ${saved.previous_ad_network || prevNetwork},
            refreshed_at = NOW()
        WHERE domain = ${cleanDomain};
      `.catch(() => {});
    }

    return normalizeMonetizationRecord(saved);
  } catch (err) {
    return normalizeMonetizationRecord({
      domain: cleanDomain,
      current_ad_network: finalNetwork,
      ad_manager_domain: managerDomain,
      primary_pub_id: primaryPubId,
      previous_ad_network: prevNetwork,
      switched_at: switchedAt,
      network_history: networkHistory,
      ads_txt_status: adsTxtStatus,
      raw_header_snippet: headerSnippet,
      checked_at: new Date().toISOString()
    });
  }
}

/**
 * Batch enriches candidate domains with ad network metadata
 */
export async function enrichMissingAdNetworksBatch(sql, candidateDomains = [], maxBatch = 10, { forceRefresh = false } = {}) {
  if (!Array.isArray(candidateDomains)) return { enriched: 0, results: [] };
  const safeMax = Math.max(1, Math.min(Number(maxBatch) || 10, 50));
  const unique = [...new Set(candidateDomains.map(normalizeCleanDomain).filter(Boolean))].slice(0, safeMax);
  if (unique.length === 0) return { enriched: 0, results: [] };

  const results = [];
  for (let i = 0; i < unique.length; i++) {
    const res = await fetchAndCacheDomainAdNetwork(sql, unique[i], { forceRefresh });
    if (res) results.push(res);
    if (i < unique.length - 1) {
      await sleep(randomJitterMs(250, 600));
    }
  }
  return { enriched: results.length, results };
}

/**
 * Returns database-wide ad network distribution metrics and global progress
 */
export async function getDatabaseMonetizationStats(sql) {
  try {
    // [INVARIANT: FAST-MONETIZATION-STATS-ROLLUP] Query domain_intelligence_rollup first for instant O(1) stats
    const [rollupStats] = await sql`
      SELECT
        COUNT(*)::int AS total_domains,
        COUNT(*) FILTER (WHERE ad_network IS NOT NULL AND ad_network <> 'unchecked')::int AS total_checked,
        COUNT(*) FILTER (WHERE ad_network = 'raptive')::int AS raptive_count,
        COUNT(*) FILTER (WHERE ad_network = 'mediavine')::int AS mediavine_count,
        COUNT(*) FILTER (WHERE ad_network = 'journey')::int AS journey_count,
        COUNT(*) FILTER (WHERE ad_network = 'ezoic')::int AS ezoic_count,
        COUNT(*) FILTER (WHERE ad_network = 'hbagency')::int AS hbagency_count,
        COUNT(*) FILTER (WHERE ad_network = 'monumetric')::int AS monumetric_count,
        COUNT(*) FILTER (WHERE ad_network = 'shemedia')::int AS shemedia_count,
        COUNT(*) FILTER (WHERE ad_network = 'freestar')::int AS freestar_count,
        COUNT(*) FILTER (WHERE ad_network = 'playwire')::int AS playwire_count,
        COUNT(*) FILTER (WHERE ad_network = 'snigel')::int AS snigel_count,
        COUNT(*) FILTER (WHERE ad_network = 'adsense')::int AS adsense_count,
        COUNT(*) FILTER (WHERE ad_network = 'affiliate_only')::int AS affiliate_count,
        COUNT(*) FILTER (WHERE ad_network = 'protected')::int AS protected_count,
        COUNT(*) FILTER (WHERE ad_network = 'failed')::int AS failed_count,
        COUNT(*) FILTER (WHERE ad_switched_at IS NOT NULL)::int AS switched_count
      FROM domain_intelligence_rollup;
    `.catch(() => []);

    if (rollupStats && Number(rollupStats.total_domains) > 0) {
      const totalDomains = Number(rollupStats.total_domains || 0);
      const checkedDomains = Number(rollupStats.total_checked || 0);
      const uncheckedDomains = Math.max(0, totalDomains - checkedDomains);
      const percentComplete = totalDomains > 0 ? Number(((checkedDomains / totalDomains) * 100).toFixed(1)) : 100;

      return {
        total_domains: totalDomains,
        checked_domains: checkedDomains,
        total_checked: checkedDomains,
        unchecked_domains: uncheckedDomains,
        percent_complete: percentComplete,
        raptive_count: Number(rollupStats.raptive_count || 0),
        mediavine_count: Number(rollupStats.mediavine_count || 0),
        journey_count: Number(rollupStats.journey_count || 0),
        ezoic_count: Number(rollupStats.ezoic_count || 0),
        hbagency_count: Number(rollupStats.hbagency_count || 0),
        monumetric_count: Number(rollupStats.monumetric_count || 0),
        shemedia_count: Number(rollupStats.shemedia_count || 0),
        freestar_count: Number(rollupStats.freestar_count || 0),
        playwire_count: Number(rollupStats.playwire_count || 0),
        snigel_count: Number(rollupStats.snigel_count || 0),
        adsense_count: Number(rollupStats.adsense_count || 0),
        affiliate_count: Number(rollupStats.affiliate_count || 0),
        protected_count: Number(rollupStats.protected_count || 0),
        failed_count: Number(rollupStats.failed_count || 0),
        switched_count: Number(rollupStats.switched_count || 0)
      };
    }

    const rows = await sql`
      WITH all_distinct AS (
        SELECT ksc.domain AS clean_domain FROM keyword_serp_current ksc WHERE ksc.domain IS NOT NULL AND ksc.domain <> ''
        UNION
        SELECT pa.domain AS clean_domain FROM pa_pins pa WHERE pa.domain IS NOT NULL AND pa.domain <> ''
        UNION
        SELECT cp.link_domain AS clean_domain FROM competitor_pins cp WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
      ),
      filtered_candidates AS (
        SELECT clean_domain
        FROM all_distinct
        WHERE clean_domain IS NOT NULL
          AND clean_domain <> ''
          AND clean_domain LIKE '%.%'
          AND clean_domain NOT LIKE '% %'
          AND LENGTH(clean_domain) >= 4
          AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
          AND clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[])
      ),
      dmm_agg AS (
        SELECT
          COUNT(*)::int AS total_checked,
          COUNT(*) FILTER (WHERE current_ad_network = 'raptive')::int AS raptive_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'mediavine')::int AS mediavine_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'journey')::int AS journey_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'ezoic')::int AS ezoic_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'hbagency')::int AS hbagency_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'monumetric')::int AS monumetric_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'shemedia')::int AS shemedia_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'freestar')::int AS freestar_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'playwire')::int AS playwire_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'snigel')::int AS snigel_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'adsense')::int AS adsense_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'affiliate_only')::int AS affiliate_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'protected')::int AS protected_count,
          COUNT(*) FILTER (WHERE current_ad_network = 'failed')::int AS failed_count,
          COUNT(*) FILTER (WHERE switched_at IS NOT NULL)::int AS switched_count
        FROM domain_monetization_metadata
        WHERE current_ad_network IS NOT NULL AND current_ad_network <> 'unchecked'
      )
      SELECT
        (SELECT COUNT(*)::int FROM filtered_candidates) AS total_domains,
        COALESCE(da.total_checked, 0) AS total_checked,
        COALESCE(da.raptive_count, 0) AS raptive_count,
        COALESCE(da.mediavine_count, 0) AS mediavine_count,
        COALESCE(da.journey_count, 0) AS journey_count,
        COALESCE(da.ezoic_count, 0) AS ezoic_count,
        COALESCE(da.hbagency_count, 0) AS hbagency_count,
        COALESCE(da.monumetric_count, 0) AS monumetric_count,
        COALESCE(da.shemedia_count, 0) AS shemedia_count,
        COALESCE(da.freestar_count, 0) AS freestar_count,
        COALESCE(da.playwire_count, 0) AS playwire_count,
        COALESCE(da.snigel_count, 0) AS snigel_count,
        COALESCE(da.adsense_count, 0) AS adsense_count,
        COALESCE(da.affiliate_count, 0) AS affiliate_count,
        COALESCE(da.protected_count, 0) AS protected_count,
        COALESCE(da.failed_count, 0) AS failed_count,
        COALESCE(da.switched_count, 0) AS switched_count
      FROM dmm_agg da;
    `;
    const r = rows[0] || {};
    const totalDomains = Number(r.total_domains || 0);
    const checkedDomains = Number(r.total_checked || 0);
    const uncheckedDomains = Math.max(0, totalDomains - checkedDomains);
    const percentComplete = totalDomains > 0 ? Number(((checkedDomains / totalDomains) * 100).toFixed(1)) : 100;

    return {
      total_domains: totalDomains,
      checked_domains: checkedDomains,
      total_checked: checkedDomains,
      unchecked_domains: uncheckedDomains,
      percent_complete: percentComplete,
      raptive_count: Number(r.raptive_count || 0),
      mediavine_count: Number(r.mediavine_count || 0),
      journey_count: Number(r.journey_count || 0),
      ezoic_count: Number(r.ezoic_count || 0),
      hbagency_count: Number(r.hbagency_count || 0),
      monumetric_count: Number(r.monumetric_count || 0),
      shemedia_count: Number(r.shemedia_count || 0),
      freestar_count: Number(r.freestar_count || 0),
      playwire_count: Number(r.playwire_count || 0),
      snigel_count: Number(r.snigel_count || 0),
      adsense_count: Number(r.adsense_count || 0),
      affiliate_count: Number(r.affiliate_count || 0),
      protected_count: Number(r.protected_count || 0),
      failed_count: Number(r.failed_count || 0),
      switched_count: Number(r.switched_count || 0)
    };
  } catch (err) {
    return {
      total_domains: 0,
      checked_domains: 0,
      total_checked: 0,
      unchecked_domains: 0,
      percent_complete: 0,
      raptive_count: 0,
      mediavine_count: 0,
      journey_count: 0,
      ezoic_count: 0,
      hbagency_count: 0,
      monumetric_count: 0,
      shemedia_count: 0,
      freestar_count: 0,
      playwire_count: 0,
      snigel_count: 0,
      adsense_count: 0,
      affiliate_count: 0,
      protected_count: 0,
      failed_count: 0,
      switched_count: 0,
      error: err.message
    };
  }
}

/**
 * Automates background priority batch scanning for unchecked ads.txt domains
 */
export async function enrichNextUncheckedAdsBatch(sql, { batchSize = 15, concurrency = 2, forceRefresh = false } = {}) {
  const bSize = Math.max(1, Math.min(Number(batchSize) || 15, 50));
  const conc = Math.max(1, Math.min(Number(concurrency) || 2, 4));

  const candidateRows = await sql`
    WITH all_candidates AS (
      SELECT
        ksc.domain AS clean_domain,
        SUM(CASE WHEN ksc.is_displaced = FALSE THEN GREATEST(1, 101 - ksc.rank_position) ELSE 1 END)::bigint AS visibility_score,
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
    LEFT JOIN domain_monetization_metadata dmm ON dmm.domain = agg.domain
    WHERE (
      ${forceRefresh} = TRUE
      OR dmm.domain IS NULL
      OR dmm.current_ad_network = 'unchecked'
      OR (dmm.current_ad_network = 'failed' AND dmm.checked_at < NOW() - INTERVAL '7 days')
    )
    ORDER BY agg.visibility_score DESC, agg.total_saves DESC
    LIMIT ${bSize};
  `;

  const domainList = candidateRows
    .map(r => normalizeCleanDomain(r.domain))
    .filter(Boolean);

  if (domainList.length === 0) {
    const stats = await getDatabaseMonetizationStats(sql);
    return {
      batch_size: 0,
      enriched: 0,
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
        return await fetchAndCacheDomainAdNetwork(sql, dom, { forceRefresh });
      } catch (_) {
        return { domain: dom, current_ad_network: 'failed', ads_txt_status: 'failed' };
      }
    });
    const batchOutputs = await Promise.all(chunkPromises);
    results.push(...batchOutputs.filter(Boolean));
    if (i + conc < domainList.length) {
      await sleep(randomJitterMs(250, 500));
    }
  }

  const stats = await getDatabaseMonetizationStats(sql);
  return {
    batch_size: domainList.length,
    enriched: results.length,
    results,
    stats,
    is_complete: stats.unchecked_domains === 0
  };
}

export { parseAdsTxtContent as parseAdsTxtMonetization };

