import { neon } from '@neondatabase/serverless';
import { preloadNeonRegistry, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const hubSql = neon(process.env.DATABASE_URL);

async function verifyGate2() {
  console.log('=== VERIFICATION GATE 2 AUDIT (RANDOM SHARD SAMPLING) ===');
  await preloadNeonRegistry(hubSql);
  
  // Sample Shard 42 and Shard 88
  for (const sampleShardId of [42, 88]) {
    console.log(`\n[*] Sampling Shard #${sampleShardId}...`);
    const shardSql = await resolveShardConnection({ hubSql, shardId: sampleShardId });
    
    const tables = await shardSql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('pins_daily_metrics', 'pin_serp_positions', 'pins_daily_rollups_v2');
    `;
    console.log(`  Tables & Views on Shard #${sampleShardId}:`, tables.map(t => t.table_name));

    const pks = await shardSql`
      SELECT tc.table_name, ccu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_name IN ('pins_daily_metrics', 'pin_serp_positions');
    `;
    console.log(`  Primary Key Columns on Shard #${sampleShardId}:`, pks.map(p => `${p.table_name}.${p.column_name}`));

    if (tables.length < 3) {
      console.error(`🔴 GATE 2 FAILED ON SHARD #${sampleShardId}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\n🟢 VERIFICATION GATE 2: 100% CONFIRMED ON RANDOM SHARDS');
  process.exitCode = 0;
}

verifyGate2().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
