import { neon } from '@neondatabase/serverless';

const hubSql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== APPLYING DEFENSIVE SHARD CONSTRAINT ACROSS NEON FLEET ===');
  
  const projects = await hubSql`
    SELECT id, project_id, project_name, is_hub, database_url
    FROM neon_projects_registry
    WHERE status = 'active' AND database_url IS NOT NULL;
  `;
  console.log(`[*] Found ${projects.length} active fleet projects in neon_projects_registry.`);

  let successCount = 0;
  for (const proj of projects) {
    try {
      const client = proj.is_hub ? hubSql : neon(proj.database_url);
      
      await client`DROP INDEX IF EXISTS uq_pins_daily_snapshots_pin_date;`;
      await client`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pins_daily_snapshots_pin_kw_date 
        ON pins_daily_snapshots (pin_id, keyword_id, snapshot_date) NULLS NOT DISTINCT;
      `;
      successCount++;
    } catch (err) {
      console.warn(`  [-] Warning updating shard "${proj.project_name}":`, err.message);
    }
  }
  console.log(`[+] Successfully updated ${successCount} fleet projects to (pin_id, keyword_id, snapshot_date) NULLS NOT DISTINCT!`);
}

run().catch(console.error);
