import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
let dbUrl = '';
for (const line of lines) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}
const sql = neon(dbUrl);

async function main() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  console.log('Tables in Hub DB:');
  console.table(tables);

  for (const t of tables) {
    try {
      const [cnt] = await sql(`SELECT count(*)::int as c FROM ${t.table_name};`);
      console.log(`- ${t.table_name}: ${cnt.c} rows`);
    } catch (e) {
      console.log(`- ${t.table_name}: error querying (${e.message})`);
    }
  }

  const sampleProjects = await sql`SELECT project_name, stats FROM neon_projects_registry LIMIT 3;`;
  console.log('\nSample registry stats:');
  console.log(sampleProjects);
}

main().catch(console.error);
