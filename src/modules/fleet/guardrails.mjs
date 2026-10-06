/**
 * Continuous Schema Drift Prevention Guardrail
 * 
 * Verifies that target database endpoints (Hub or Shards) have applied the required
 * schema migrations before workers attempt to consume queues or execute batch writes.
 * 
 * Fails fast with clear diagnostics rather than corrupting jobs or throwing raw SQL errors.
 */

export async function assertShardSchemaParity(sqlClient, requiredVersion = '011', endpointName = 'Endpoint') {
  try {
    const [row] = await sqlClient`
      SELECT version, name, applied_at 
      FROM schema_migrations 
      WHERE version = ${requiredVersion} 
      LIMIT 1;
    `;

    if (!row) {
      throw new Error(`Schema drift detected on ${endpointName}: Missing required migration version '${requiredVersion}'.`);
    }

    return {
      compatible: true,
      version: row.version,
      name: row.name,
      applied_at: row.applied_at
    };
  } catch (err) {
    if (/relation "schema_migrations" does not exist/i.test(err.message)) {
      throw new Error(`CRITICAL: Database ${endpointName} is uninitialized. 'schema_migrations' table does not exist.`);
    }
    throw err;
  }
}

/**
 * Audit and report version across an array of shards.
 */
export async function auditFleetSchemaVersions(hubSql) {
  const shards = await hubSql`
    SELECT id, project_name, database_url, is_hub, status
    FROM neon_projects_registry
    WHERE status = 'active'
    ORDER BY is_hub DESC, id ASC;
  `;

  const results = [];
  for (const s of shards) {
    try {
      const sSql = neon(s.database_url);
      const rows = await sSql`SELECT version, name, applied_at FROM schema_migrations ORDER BY applied_at DESC;`;
      results.push({
        id: s.id,
        name: s.project_name,
        is_hub: s.is_hub,
        latest_version: rows[0]?.version || 'unversioned',
        total_migrations: rows.length,
        status: 'synced'
      });
    } catch (err) {
      results.push({
        id: s.id,
        name: s.project_name,
        is_hub: s.is_hub,
        latest_version: 'error',
        total_migrations: 0,
        status: 'drifted',
        error: err.message
      });
    }
  }

  return results;
}
