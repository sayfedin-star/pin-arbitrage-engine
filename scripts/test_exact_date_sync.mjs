import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

const NEON_URL = process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
const INSTABOX_URL = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(NEON_URL);
const pgSql = postgres(INSTABOX_URL, { max: 10, idle_timeout: 20 });

async function testOnePin() {
  const pinId = '1047016613516965872';
  console.log(`Testing exact date sync for pin ${pinId}...`);

  const colsRes = await neonSql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'pins_daily_metrics'
    ORDER BY ordinal_position;
  `;
  console.log('Neon cols:', colsRes.map(c => c.column_name));

  const selectCols = colsRes
    .map(c => c.column_name === 'snapshot_date' ? 'snapshot_date::text AS snapshot_date' : `"${c.column_name}"`)
    .join(', ');

  const rows = await neonSql(`
    SELECT ${selectCols}
    FROM pins_daily_metrics
    WHERE pin_id = '${pinId}'
    ORDER BY snapshot_date DESC;
  `);
  console.log('Fetched from Neon:', rows);

  // Delete existing on target
  await pgSql`DELETE FROM pins_daily_metrics WHERE pin_id = ${pinId}`;

  // Insert with string date
  const targetCols = colsRes.map(c => c.column_name).filter(c => c !== 'shard_id');
  await pgSql`INSERT INTO pins_daily_metrics ${pgSql(rows, targetCols)}`;

  // Query back from target
  const targetRows = await pgSql`
    SELECT pin_id, snapshot_date::text AS snapshot_date, save_count, repin_count, daily_save_velocity
    FROM pins_daily_metrics
    WHERE pin_id = ${pinId}
    ORDER BY snapshot_date DESC;
  `;
  console.log('Target rows after sync:', targetRows);

  await pgSql.end();
}

testOnePin().catch(console.error);
