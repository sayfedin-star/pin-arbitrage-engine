import fs from 'fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env', 'utf-8');
const dbUrl = env.match(/DATABASE_URL="?([^"\r\n]+)"?/)[1];
const sql = neon(dbUrl);

async function syncAll() {
  console.log('[*] Syncing fleet stats in neon_projects_registry...');
  
  // 1. Hub
  const [hubCnt] = await sql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
  await sql`
    UPDATE neon_projects_registry 
    SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(hubCnt.c)}::jsonb),
        updated_at = NOW()
    WHERE is_hub = TRUE;
  `;
  console.log(`[+] Hub competitors count: ${hubCnt.c}`);

  // 2. All shards (default to 0 except shard-01 which is 1)
  await sql`
    UPDATE neon_projects_registry 
    SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', '0'::jsonb),
        updated_at = NOW()
    WHERE is_hub = FALSE;
  `;

  // 3. Shard 01
  const [shard01] = await sql`SELECT project_id, database_url FROM neon_projects_registry WHERE project_name LIKE '%shard-01' LIMIT 1;`;
  if (shard01) {
    const sSql = neon(shard01.database_url);
    const [sCnt] = await sSql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
    await sql`
      UPDATE neon_projects_registry 
      SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(sCnt.c)}::jsonb),
          updated_at = NOW()
      WHERE project_id = ${shard01.project_id};
    `;
    console.log(`[+] Shard-01 competitors count: ${sCnt.c}`);
  }

  const active = await sql`
    SELECT project_name, stats->>'competitors' as competitors
    FROM neon_projects_registry
    WHERE (stats->>'competitors')::int > 0;
  `;
  console.log('[+] Active projects with competitors > 0:', active);
}

syncAll().catch(console.error);
