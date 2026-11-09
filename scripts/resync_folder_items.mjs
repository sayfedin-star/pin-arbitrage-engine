import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

const NEON_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
const INSTABOX_URL = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(NEON_URL);
const pgSql = postgres(INSTABOX_URL, { max: 10, idle_timeout: 20 });

async function run() {
  console.log('Re-syncing folder_competitor_items from Neon...');
  const cols = await pgSql`
    SELECT column_name, is_generated 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'folder_competitor_items'
    ORDER BY ordinal_position;
  `;
  const targetCols = cols
    .filter(c => c.is_generated === 'NEVER' && c.column_name !== 'shard_id')
    .map(c => c.column_name);

  const colListSql = targetCols.map(c => `"${c}"`).join(', ');
  const sourceRows = await neonSql(`SELECT ${colListSql} FROM folder_competitor_items`);
  console.log(`Fetched ${sourceRows.length} rows from Neon.`);

  const batchSize = 500;
  for (let i = 0; i < sourceRows.length; i += batchSize) {
    const slice = sourceRows.slice(i, i + batchSize);
    await pgSql`INSERT INTO folder_competitor_items ${pgSql(slice, targetCols)}`;
    process.stdout.write(`Inserted ${Math.min(i + batchSize, sourceRows.length)} / ${sourceRows.length} rows...\r`);
  }
  console.log('\nfolder_competitor_items synced successfully!');
  const [{ count }] = await pgSql`SELECT COUNT(*) FROM folder_competitor_items`;
  console.log(`Verified count: ${count}`);
  await pgSql.end();
}

run().catch(console.error);
