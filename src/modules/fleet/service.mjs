/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

import { neon } from '@neondatabase/serverless';
import { getCompetitorsOverview, listCompetitors, formatMetric } from '../competitors/service.mjs';

export async function getFleetProjects(sql) {
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
    const masked = r.database_url ? r.database_url.replace(/:([^:@]+)@/, ':••••••••@') : '';
    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      region_id: r.region_id,
      database_url: masked,
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
      ${database_url},
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
    RETURNING *;
  `;
  return row;
}

/**
 * Aggregates competitor intelligence KPIs and lists across all active fleet projects
 */
export async function getFleetCompetitors(sql, { account_type = 'all', search = '', limit = 50, offset = 0 } = {}) {
  const activeProjects = await sql`
    SELECT project_id, project_name, database_url, is_hub, stats
    FROM neon_projects_registry
    WHERE status = 'active' AND (
      is_hub = TRUE 
      OR stats IS NULL 
      OR (stats->>'competitors')::int > 0
    )
    ORDER BY is_hub DESC, id ASC;
  `;

  const results = await Promise.allSettled(activeProjects.map(async (p) => {
    const pSql = p.is_hub ? sql : neon(p.database_url);
    const overview = await getCompetitorsOverview(pSql);
    let list = [];
    if (overview.tracked_profiles > 0) {
      list = await listCompetitors(pSql, { account_type, search, limit: 100, offset: 0 });
      list = list.map(item => ({
        ...item,
        _shard_name: p.project_name,
        _project_id: p.project_id
      }));
    }
    return { project: p, overview, list };
  }));

  let total_profiles = 0;
  let competitor_count = 0;
  let own_count = 0;
  let combined_reach = 0;
  let total_audience = 0;
  let pins_tracked = 0;
  let allCompetitors = [];
  let topCompetitor = null;
  let maxReach = -1;

  for (const res of results) {
    if (res.status === 'fulfilled') {
      const { overview, list } = res.value;
      total_profiles += overview.tracked_profiles || 0;
      competitor_count += overview.competitor_count || 0;
      own_count += overview.own_count || 0;
      combined_reach += overview.combined_reach || 0;
      total_audience += overview.total_audience || 0;
      pins_tracked += overview.pins_tracked || 0;
      allCompetitors.push(...list);
      for (const c of list) {
        if (Number(c.monthly_reach || 0) > maxReach) {
          maxReach = Number(c.monthly_reach || 0);
          topCompetitor = {
            handle: c.handle || `@${c.username}`,
            reach: formatMetric(c.monthly_reach, true)
          };
        }
      }
    }
  }

  allCompetitors.sort((a, b) => Number(b.monthly_reach || 0) - Number(a.monthly_reach || 0));

  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  return {
    overview: {
      tracked_profiles: total_profiles,
      competitor_count,
      own_count,
      combined_reach,
      total_audience,
      pins_tracked,
      top_competitor: topCompetitor
    },
    competitors: allCompetitors.slice(off, off + lim)
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

