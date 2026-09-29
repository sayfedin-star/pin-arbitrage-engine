/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

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
