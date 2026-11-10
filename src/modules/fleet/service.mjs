/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

import { getCompetitorsOverview, listCompetitors } from '../creators/service.mjs';
import { getShardNumberForEntity, enforceNeonPoolerUrl, createUniversalSqlClient } from '../sharding/fleet-router.mjs';
import { maskDatabaseUrl } from '../../utils.mjs';
export { enforceNeonPoolerUrl, maskDatabaseUrl };

/**
 * Fetches fleet projects from Central Hub.
 * Returns a single unified node representation for Unified PostgreSQL SSOT architecture.
 *
 * @param {Function} sql - Hub client
 * @param {object} [options]
 * @param {boolean} [options.unmasked=false] - Whether to preserve raw unmasked database_url
 * @returns {Promise<Array<object>>}
 */
export async function getFleetProjects(sql, { unmasked = false } = {}) {
  const rawUrl = process.env.DATABASE_URL || '';
  const masked = maskDatabaseUrl(rawUrl);
  return [{
    id: 1,
    project_id: 'unified-vps-hub',
    project_name: 'Native VPS PostgreSQL SSOT',
    region_id: 'vps-native',
    database_url: unmasked ? rawUrl : masked,
    masked_url: masked,
    status: 'active',
    is_hub: true,
    assigned_shards: Array.from({ length: 99 }, (_, i) => i + 1),
    stats: {}
  }];
}

export async function registerNewProject(sql, { project_id, project_name, database_url, region_id = 'aws-us-east-2', assigned_shards = [] }) {
  if (!project_id || !database_url) {
    throw new Error('project_id and database_url are required.');
  }
  let parsedDsn;
  try {
    parsedDsn = new URL(database_url);
  } catch (_) {
    throw new Error('Invalid database_url format.');
  }
  if (!/^postgres(?:ql)?:$/i.test(parsedDsn.protocol)) {
    throw new Error('Security Policy Violation: Only PostgreSQL endpoints are permitted.');
  }
  const pooledUrl = enforceNeonPoolerUrl(database_url.trim());
  const masked = maskDatabaseUrl(pooledUrl);
  return {
    id: 1,
    project_id,
    project_name: project_name || project_id,
    region_id,
    database_url: masked,
    masked_url: masked,
    status: 'active',
    is_hub: false,
    assigned_shards,
    stats: { seeds: 0, candidates: 0, storage_mb: 0 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Aggregates competitor intelligence KPIs and lists across all active fleet projects.
 * // [INVARIANT: ZERO-ACCOUNT-SHARDING] Competitor intelligence lives exclusively on Central Hub
 */
export async function getFleetCompetitors(sql, { account_type = 'all', search = '', limit = 50, offset = 0 } = {}) {
  const [overview, competitors] = await Promise.all([
    getCompetitorsOverview(sql),
    listCompetitors(sql, { account_type, search, limit, offset })
  ]);

  return {
    overview,
    competitors
  };
}

/**
 * Synchronizes competitor counts (clean no-op in unified PostgreSQL architecture).
 */
export async function syncProjectCompetitorStats(sql, targetSql, projectId) {
  return { ok: true };
}

/**
 * Synchronize a competitor across fleet.
 * [INVARIANT: CENTRAL-HUB-CREATOR-AUTHORITY]
 * Competitor profiles and boards are strictly maintained on Central Hub.
 * Shards never store competitor profiles or boards; zero shard fan-out.
 */
export async function syncCompetitorAcrossFleet(hubSql, competitorUsernameOrId, options = {}) {
  if (!competitorUsernameOrId) return { ok: false, error: 'competitor identifier required' };
  try {
    const cleanUser = String(competitorUsernameOrId).replace(/^@+/, '').trim().toLowerCase();
    const [p] = await hubSql`
      SELECT id, username FROM competitor_profiles 
      WHERE LOWER(username) = ${cleanUser} OR id::text = ${String(competitorUsernameOrId)} 
      LIMIT 1;
    `;
    if (!p) return { ok: false, error: 'Competitor profile not found on Hub' };

    return {
      ok: true,
      username: p.username,
      synced_shards: 0,
      boards_count: 0,
      message: 'Competitors managed exclusively on Central Hub'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fleet synchronization: synchronizes all competitor profiles, boards, and archived pins.
 */
// [INVARIANT: ZERO-ACCOUNT-SHARDING-SSOT]
// Competitor intelligence (profiles, boards, rules) resides strictly on Central Hub (SSOT).
export async function syncFleetDatabases(hubSql, { targetProjectId = null } = {}) {
  const profiles = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_profiles WHERE is_active = TRUE;`.catch(() => [{ count: 0 }]);
  const boards = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_boards;`.catch(() => [{ count: 0 }]);
  const [{ count: pinsCount }] = await hubSql`SELECT COUNT(*)::int AS count FROM pa_pins;`.catch(() => [{ count: 0 }]);
  const metricsCount = 0;

  return {
    ok: true,
    total_shards: 1,
    successful_shards: 1,
    profiles_count: Number(profiles[0]?.count || 0),
    boards_count: Number(boards[0]?.count || 0),
    pins_count: Number(pinsCount || 0),
    metrics_count: Number(metricsCount || 0)
  };
}

/**
 * Ping fleet database to measure live roundtrip database latency.
 */
export async function pingFleetProject(hubSql, projectId) {
  const start = performance.now();
  await hubSql`SELECT 1;`;
  const latencyMs = Math.round(performance.now() - start);

  return {
    ok: true,
    project_id: projectId || 'unified-vps-hub',
    project_name: 'Native VPS PostgreSQL SSOT',
    latency_ms: latencyMs,
    status: 'active'
  };
}

/**
 * Retrieve clean database connection URL for authorized fleet administration.
 */
export async function getFleetProjectUrl(hubSql, projectId, { allowUnmasked = false } = {}) {
  const rawUrl = process.env.DATABASE_URL || '';
  const maskedUrl = maskDatabaseUrl(rawUrl);
  return {
    ok: true,
    project_id: projectId || 'unified-vps-hub',
    project_name: 'Native VPS PostgreSQL SSOT',
    masked_url: maskedUrl,
    database_url: allowUnmasked ? rawUrl : maskedUrl,
    database_url_masked: maskedUrl
  };
}


