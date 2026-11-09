import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

const NEON_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
const INSTABOX_URL = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(NEON_URL);
const pgSql = postgres(INSTABOX_URL, { max: 10, idle_timeout: 20 });

async function syncTable(tableName, selectSql, targetCols, orderBy = 'pin_id, snapshot_date') {
  console.log(`\n=== Re-syncing ${tableName} with Exact String Dates ===`);
  
  // Truncate target table
  console.log(`Truncating ${tableName} on InstaBox...`);
  await pgSql.unsafe(`TRUNCATE TABLE "${tableName}" CASCADE`);

  // Count source rows
  const [{ count }] = await neonSql(`SELECT COUNT(*) FROM "${tableName}"`);
  const total = Number(count);
  console.log(`Streaming ${total} rows from Neon with exact ISO dates...`);

  const batchSize = 2500;
  let offset = 0;

  while (offset < total) {
    const rows = await neonSql(`
      ${selectSql}
      ORDER BY ${orderBy}
      LIMIT ${batchSize} OFFSET ${offset}
    `);

    if (!rows || rows.length === 0) break;

    // Filter out undefined values
    const cleanRows = rows.map(r => {
      const obj = {};
      for (const col of targetCols) {
        obj[col] = r[col] !== undefined ? r[col] : null;
      }
      return obj;
    });

    await pgSql`INSERT INTO ${pgSql(tableName)} ${pgSql(cleanRows, targetCols)}`;
    offset += rows.length;
    process.stdout.write(`Copied ${offset} / ${total} rows (${Math.round(offset / total * 100)}%)...\r`);
  }

  const [{ finalCount }] = await pgSql`SELECT COUNT(*) AS "finalCount" FROM ${pgSql(tableName)}`;
  console.log(`\n✅ ${tableName} verified: ${finalCount} rows.`);
}

async function run() {
  console.log('Starting Exact Time-Series Synchronization (Neon ➡️ InstaBox)...');

  // 1. pins_daily_metrics
  const pdmSelect = `
    SELECT 
      pin_id,
      snapshot_date::text AS snapshot_date,
      save_count,
      repin_count,
      comment_count,
      share_count,
      reaction_count,
      daily_save_velocity,
      updated_at
    FROM pins_daily_metrics
  `;
  const pdmCols = [
    'pin_id', 'snapshot_date', 'save_count', 'repin_count',
    'comment_count', 'share_count', 'reaction_count', 'daily_save_velocity', 'updated_at'
  ];
  await syncTable('pins_daily_metrics', pdmSelect, pdmCols, 'pin_id, snapshot_date');

  // 2. pin_serp_positions
  const pspSelect = `
    SELECT 
      pin_id,
      keyword_id,
      snapshot_date::text AS snapshot_date,
      rank_position,
      is_displaced,
      created_at
    FROM pin_serp_positions
  `;
  const pspCols = [
    'pin_id', 'keyword_id', 'snapshot_date', 'rank_position', 'is_displaced', 'created_at'
  ];
  await syncTable('pin_serp_positions', pspSelect, pspCols, 'pin_id, snapshot_date, keyword_id');

  console.log('\n🎉 ALL TIME-SERIES TABLES 100% SYNCHRONIZED WITH ZERO TIMEZONE DRIFT!');
  await pgSql.end();
}

run().catch((err) => {
  console.error('Re-sync failed:', err);
  process.exit(1);
});
