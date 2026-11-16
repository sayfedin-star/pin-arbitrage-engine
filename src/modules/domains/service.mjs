/**
 * src/modules/domains/service.mjs
 *
 * Cross-Pillar Domain Intelligence, SERP Monopoly & WHOIS Age Engine (Barrel Module)
 *
 * Submodules:
 * - domain-constants.mjs: Domain normalization & marketplace/social exclusion lists
 * - ad-network-service.mjs: ads.txt monetization parser & batch enrichment
 * - whois-age-service.mjs: WHOIS/RDAP/crt.sh domain age resolution & enrichment stats
 * - rollup-leaderboard-service.mjs: Materialized domain_intelligence_rollup & leaderboard queries
 * - dossier-blueprint-service.mjs: Deep forensic domain dossier, Sybil/PBN metrics & arbitrage blueprint
 */

export {
  IGNORED_INTERNAL_DOMAINS,
  ECOMMERCE_AND_SOCIAL_DOMAINS,
  BLOCKED_TLD_SUFFIXES,
  normalizeCleanDomain
} from './domain-constants.mjs';

export {
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
  escapeSqlLike,
  queryWhoisSocket,
  queryWhoisHttpsRdap,
  fetchAndCacheDomainAge,
  enrichMissingDomainsBatch,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch
} from './whois-age-service.mjs';

export {
  listDomainsIntelligence,
  refreshDomainIntelligenceRollup,
  syncSingleDomainRollup,
  listDomainsIntelligenceFast
} from './rollup-leaderboard-service.mjs';

export {
  computeSybilPbnMetrics,
  detectMarketingAngle,
  getDomainDeepDossier,
  generateDomainArbitrageBlueprint
} from './dossier-blueprint-service.mjs';
