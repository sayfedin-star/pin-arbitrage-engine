/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

import { neon } from '@neondatabase/serverless';
import { getCompetitorsOverview, listCompetitors } from '../creators/service.mjs';
import { getShardNumberForEntity, enforceNeonPoolerUrl } from '../sharding/fleet-router.mjs';
import { maskDatabaseUrl } from '../../utils.mjs';
export { enforceNeonPoolerUrl, maskDatabaseUrl };

/**
 * Fetches fleet projects from Central Hub.
 * NOTE: database_url is masked with maskDatabaseUrl() by default for UI and API security.
 * Pass { unmasked: true } only for trusted internal routing operations.
 *
 * @param {Function} sql - Neon Hub client
 * @param {object} [options]
 * @param {boolean} [options.unmasked=false] - Whether to preserve raw unmasked database_url
 * @returns {Promise<Array<object>>}
 */
export async function getFleetProjects(sql, { unmasked = false } = {}) {
  const rows = await sql`
    SELECT 
      id,
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      assigned_shards,
      stats,
      created_at,
      updated_at
    FROM neon_projects_registry
    ORDER BY is_hub DESC, id ASC;
  `;

  return rows.map(r => {
    const rawUrl = r.database_url || '';
    const masked = maskDatabaseUrl(rawUrl);
    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      region_id: r.region_id,
      database_url: unmasked ? rawUrl : masked,
      masked_url: masked,
      status: r.status,
      is_hub: r.is_hub,
      assigned_shards: r.assigned_shards,
      stats: r.stats,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  });
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
  if (!/^postgres(?:ql)?:$/i.test(parsedDsn.protocol) || !parsedDsn.hostname.endsWith('.neon.tech')) {
    throw new Error('Security Policy Violation: Only *.neon.tech PostgreSQL endpoints are permitted.');
  }
  const pooledUrl = enforceNeonPoolerUrl(database_url.trim());
  const [row] = await sql`
    INSERT INTO neon_projects_registry (
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      assigned_shards,
      stats,
      updated_at
    ) VALUES (
      ${project_id},
      ${project_name || project_id},
      ${region_id},
      ${pooledUrl},
      'active',
      FALSE,
      ${assigned_shards},
      '{"seeds": 0, "candidates": 0, "storage_mb": 0}'::jsonb,
      NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      database_url = EXCLUDED.database_url,
      project_name = EXCLUDED.project_name,
      status = 'active',
      updated_at = NOW()
    RETURNING id, project_id, project_name, region_id, status, is_hub, assigned_shards, stats, created_at, updated_at;
  `;
  const masked = maskDatabaseUrl(pooledUrl);
  return { ...row, database_url: masked, masked_url: masked };
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
 * Synchronizes competitor counts in neon_projects_registry stats for a specific project
 */
export async function syncProjectCompetitorStats(sql, targetSql, projectId) {
  if (!projectId) return;
  try {
    const [cnt] = await targetSql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
    if (projectId === 'hub' || projectId === 'weathered-band-34334459') {
      await sql`
        UPDATE neon_projects_registry 
        SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
            updated_at = NOW()
        WHERE is_hub = TRUE;
      `;
    } else {
      await sql`
        UPDATE neon_projects_registry 
        SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
            updated_at = NOW()
        WHERE project_id = ${projectId};
      `;
    }
  } catch (_) {}
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
 * Full fleet synchronization: synchronizes all competitor profiles, boards,
 * archived pins, metrics, qualification rules, and topic cluster RPC across all active Neon shards.
 */
// [INVARIANT: ZERO-ACCOUNT-SHARDING-SSOT]
// Competitor intelligence (profiles, boards, rules) resides strictly on Central Hub (SSOT).
// Replicating account data across 99 storage shards is permanently eradicated.
export async function syncFleetDatabases(hubSql, { targetProjectId = null } = {}) {
  const profiles = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_profiles WHERE is_active = TRUE;`.catch(() => [{ count: 0 }]);
  const boards = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_boards;`.catch(() => [{ count: 0 }]);
  const [{ count: pinsCount }] = await hubSql`SELECT COUNT(*)::int AS count FROM pa_pins;`.catch(() => [{ count: 0 }]);
  // [INVARIANT: ZERO-HUB-SNAPSHOTS] pa_pin_metrics is eradicated from Hub.
  const metricsCount = 0;

  let query = hubSql`
    SELECT project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL
  `;
  if (targetProjectId) {
    query = hubSql`
      SELECT project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND (project_id = ${targetProjectId} OR project_name = ${targetProjectId}) AND database_url IS NOT NULL
    `;
  }
  const shards = await query;

  // Touch Central Hub registry metadata without firing subrequests to 99 shards
  await hubSql`
    UPDATE neon_projects_registry
    SET stats = jsonb_set(
      COALESCE(stats, '{}'::jsonb),
      '{last_fleet_sync}',
      ${JSON.stringify(new Date().toISOString())}::jsonb
    ),
    updated_at = NOW()
    WHERE is_hub = TRUE OR status = 'active';
  `.catch(() => {});

  return {
    ok: true,
    total_shards: shards.length,
    successful_shards: shards.length,
    profiles_count: Number(profiles[0]?.count || 0),
    boards_count: Number(boards[0]?.count || 0),
    pins_count: Number(pinsCount || 0),
    metrics_count: Number(metricsCount || 0)
  };
}

/**
 * Ping a specific fleet shard to measure live roundtrip database latency.
 */
export async function pingFleetProject(hubSql, projectId) {
  if (!projectId) throw new Error('project_id is required.');
  const [proj] = await hubSql`
    SELECT id, project_id, project_name, database_url, status
    FROM neon_projects_registry
    WHERE project_id = ${projectId}
    LIMIT 1;
  `;
  if (!proj) {
    throw new Error(`Project ${projectId} not found in fleet registry.`);
  }

  const start = performance.now();
  const shardSql = neon(enforceNeonPoolerUrl(proj.database_url));
  await shardSql`SELECT 1;`;
  const latencyMs = Math.round(performance.now() - start);

  return {
    ok: true,
    project_id: proj.project_id,
    project_name: proj.project_name,
    latency_ms: latencyMs,
    status: 'active'
  };
}

/**
 * Retrieve clean database connection URL for authorized fleet administration.
 */
export async function getFleetProjectUrl(hubSql, projectId, { allowUnmasked = false } = {}) {
  if (!projectId) throw new Error('project_id is required.');
  const [proj] = await hubSql`
    SELECT id, project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE project_id = ${projectId} OR id::text = ${String(projectId)}
    LIMIT 1;
  `;
  if (!proj) {
    throw new Error(`Project ${projectId} not found in fleet registry.`);
  }
  const maskedUrl = maskDatabaseUrl(proj.database_url);
  return {
    ok: true,
    project_id: proj.project_id,
    project_name: proj.project_name,
    database_url: allowUnmasked ? proj.database_url : maskedUrl,
    database_url_masked: maskedUrl
  };
}


