import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

const NEON_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
const INSTABOX_URL = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

console.log('Connecting to Neon Source and InstaBox Target...');
const neonSql = neon(NEON_URL);
const pgSql = postgres(INSTABOX_URL, { max: 10, idle_timeout: 20 });

async function run() {
  console.log('--- Step 1: DDL Alignment on Target ---');
  await pgSql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMPTZ;`;
  await pgSql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS creation_method VARCHAR(64);`;
  await pgSql`
    CREATE TABLE IF NOT EXISTS keyword_tombstones (
      keyword_id INTEGER PRIMARY KEY,
      keyword TEXT,
      deleted_at TIMESTAMPTZ DEFAULT now(),
      shards_purged BOOLEAN DEFAULT false,
      purged_at TIMESTAMPTZ
    );
  `;
  console.log('DDL changes applied successfully.');

  console.log('--- Step 2: Backfilling created_at_pinterest and creation_method into keyword_serp_current ---');
  // Read created_at_pinterest and creation_method from Neon for keyword_serp_current
  const serpRows = await neonSql`
    SELECT id, created_at_pinterest, creation_method 
    FROM keyword_serp_current
    WHERE created_at_pinterest IS NOT NULL OR creation_method IS NOT NULL;
  `;
  console.log(`Fetched ${serpRows.length} rows with metadata from Neon.`);

  let updatedCount = 0;
  const batchSize = 500;
  for (let i = 0; i < serpRows.length; i += batchSize) {
    const batch = serpRows.slice(i, i + batchSize);
    await pgSql.begin(async (tx) => {
      for (const row of batch) {
        await tx`
          UPDATE keyword_serp_current 
          SET 
            created_at_pinterest = ${row.created_at_pinterest},
            creation_method = ${row.creation_method}
          WHERE id = ${row.id};
        `;
      }
    });
    updatedCount += batch.length;
    process.stdout.write(`Updated ${updatedCount} / ${serpRows.length} rows...\r`);
  }
  console.log(`\nkeyword_serp_current backfilled with ${updatedCount} rows.`);

  console.log('--- Step 3: Syncing Missing Tables ---');
  const TABLES = [
    'keyword_folders',
    'keyword_folder_items',
    'keyword_guided_capsules',
    'keyword_tombstones',
    'competitor_related_nodes',
    'competitor_seed_pins',
    'pin_visual_search_cache',
    'pa_qualification_rules',
    'app_settings'
  ];

  for (const tableName of TABLES) {
    console.log(`\nSyncing table: ${tableName}...`);
    // Inspect target table columns
    const cols = await pgSql`
      SELECT column_name, is_generated 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;
    const targetCols = cols
      .filter(c => c.is_generated === 'NEVER' && c.column_name !== 'shard_id')
      .map(c => c.column_name);

    if (targetCols.length === 0) {
      console.log(`No writable columns for ${tableName}, skipping.`);
      continue;
    }

    const colListSql = targetCols.map(c => `"${c}"`).join(', ');
    const sourceRows = await neonSql(`SELECT ${colListSql} FROM "${tableName}"`);
    console.log(`Found ${sourceRows.length} rows in Neon for ${tableName}.`);

    if (sourceRows.length === 0) continue;

    // Truncate target table first to avoid duplicate PKs
    await pgSql(`TRUNCATE TABLE "${tableName}" CASCADE`);

    // Insert in batches of 200
    const insertBatchSize = 200;
    for (let i = 0; i < sourceRows.length; i += insertBatchSize) {
      const slice = sourceRows.slice(i, i + insertBatchSize);
      await pgSql`INSERT INTO ${pgSql(tableName)} ${pgSql(slice, targetCols)}`;
    }
    console.log(`Inserted ${sourceRows.length} rows into ${tableName}.`);
  }

  console.log('\n--- Sync Verification ---');
  for (const tableName of TABLES) {
    const [{ count }] = await pgSql`SELECT COUNT(*) FROM ${pgSql(tableName)}`;
    console.log(`${tableName}: ${count} rows`);
  }

  const [{ serpColCount }] = await pgSql`
    SELECT COUNT(*) AS "serpColCount" 
    FROM keyword_serp_current 
    WHERE created_at_pinterest IS NOT NULL OR creation_method IS NOT NULL;
  `;
  console.log(`keyword_serp_current with metadata: ${serpColCount}`);

  await pgSql.end();
  console.log('\nALL MISSING TABLES AND COLUMNS SYNCED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
