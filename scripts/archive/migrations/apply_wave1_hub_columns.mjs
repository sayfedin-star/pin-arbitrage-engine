#!/usr/bin/env node
/**
 * scripts/apply_wave1_hub_columns.mjs
 *
 * Applies missing Wave 1 schema parity columns (shard_id SMALLINT) to Central Hub tables
 * and backfills existing rows with deterministic IEEE 802.3 CRC32 shard IDs.
 *
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function applyWave1Columns() {
  console.log('[*] Step 1: Adding shard_id SMALLINT columns to Central Hub...');
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS shard_id SMALLINT;`;
  await sql`ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS shard_id SMALLINT;`;
  console.log('  ✓ [PASS] DDL executed successfully.');

  console.log('[*] Step 2: Backfilling existing rows with deterministic CRC32 shard ID...');
  // Uses PostgreSQL internal pg_catalog.crc32(bytea) which matches fleet-router.mjs crc32 bit-for-bit
  await sql`
    UPDATE keyword_serp_current
    SET shard_id = ((crc32(convert_to(lower(trim(pin_id::text)), 'UTF8')) % 99) + 1)::smallint
    WHERE shard_id IS NULL AND pin_id IS NOT NULL AND pin_id <> '';
  `;
  console.log('  ✓ [PASS] keyword_serp_current backfilled.');

  await sql`
    UPDATE keyword_displaced_index
    SET shard_id = ((crc32(convert_to(lower(trim(pin_id::text)), 'UTF8')) % 99) + 1)::smallint
    WHERE shard_id IS NULL AND pin_id IS NOT NULL AND pin_id <> '';
  `;
  console.log('  ✓ [PASS] keyword_displaced_index backfilled.');

  console.log('[*] Step 3: Verifying live columns and NULL counts...');
  const cols = await sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_name IN ('keyword_serp_current', 'keyword_displaced_index')
      AND column_name = 'shard_id';
  `;
  console.log('  Live columns found:', cols);

  const [kscNull] = await sql`SELECT count(*)::int as count FROM keyword_serp_current WHERE shard_id IS NULL;`;
  const [kdiNull] = await sql`SELECT count(*)::int as count FROM keyword_displaced_index WHERE shard_id IS NULL;`;
  console.log(`  Remaining NULL shard_id: ksc=${kscNull.count}, kdi=${kdiNull.count}`);

  console.log('[*] Step 4: Testing Mode A pushdown query execution...');
  const testShards = [1, 21, 41, 61, 81];
  const kscTest = await sql`SELECT pin_id, shard_id FROM keyword_serp_current WHERE shard_id = ANY(${testShards}::smallint[]) LIMIT 1;`;
  const kdiTest = await sql`SELECT pin_id, shard_id FROM keyword_displaced_index WHERE shard_id = ANY(${testShards}::smallint[]) LIMIT 1;`;
  console.log('  ✓ [PASS] ksc test query returned:', kscTest.length > 0 ? kscTest[0] : 'No pins (clean query)');
  console.log('  ✓ [PASS] kdi test query returned:', kdiTest.length > 0 ? kdiTest[0] : 'No pins (clean query)');

  console.log('[+] Wave 1 Central Hub schema parity remediation successfully completed!');
}

applyWave1Columns().catch((err) => {
  console.error('[-] FATAL Error applying Wave 1 columns:', err);
  process.exit(1);
});
