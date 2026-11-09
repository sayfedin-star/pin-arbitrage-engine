import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

const NEON_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
const INSTABOX_URL = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(NEON_URL);
const pgSql = postgres(INSTABOX_URL, { max: 10, idle_timeout: 20 });

async function run() {
  console.log('Re-syncing folder_competitor_items with valid FKs...');
  
  // Truncate any partial rows
  await pgSql`TRUNCATE TABLE folder_competitor_items;`;

  // Fetch only rows where competitor_id exists in competitor_profiles and folder_id exists in keyword_folders
  const sourceRows = await neonSql`
    SELECT fci.*
    FROM folder_competitor_items fci
    JOIN competitor_profiles cp ON cp.id = fci.competitor_id
    JOIN keyword_folders kf ON kf.id = fci.folder_id;
  `;
  console.log(`Fetched ${sourceRows.length} valid FK rows from Neon.`);

  const targetCols = [
    'folder_id',
    'competitor_id',
    'created_at',
    'added_by',
    'metadata'
  ];

  const batchSize = 500;
  for (let i = 0; i < sourceRows.length; i += batchSize) {
    const slice = sourceRows.slice(i, i + batchSize);
    await pgSql`INSERT INTO folder_competitor_items ${pgSql(slice, targetCols)}`;
    process.stdout.write(`Inserted ${Math.min(i + batchSize, sourceRows.length)} / ${sourceRows.length} rows...\r`);
  }
  console.log('\nfolder_competitor_items synced successfully!');
  const [{ count }] = await pgSql`SELECT COUNT(*) FROM folder_competitor_items`;
  console.log(`Verified count on InstaBox: ${count}`);
  await pgSql.end();
}

run().catch(console.error);
