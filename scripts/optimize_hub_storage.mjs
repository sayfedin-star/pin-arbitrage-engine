import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('================================================================');
  console.log('🧹 NEON DATABASE STORAGE & DEAD TUPLE OPTIMIZATION (PHASE 5)');
  console.log('================================================================\n');

  console.log('[*] Step 1: Inspecting Table Statistics & Dead Tuples...');
  const tableStats = await sql`
    SELECT 
      relname AS table_name,
      n_live_tup AS live_tuples,
      n_dead_tup AS dead_tuples,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size
    FROM pg_stat_user_tables
    WHERE relname IN (
      'keyword_pins_snapshots', 
      'keyword_displaced_pins', 
      'competitor_pins', 
      'pa_pins', 
      'tracked_keywords'
    )
    ORDER BY n_dead_tup DESC;
  `;

  console.table(tableStats);

  console.log('\n[*] Step 2: Checking Old Snapshots (> 30 days retention)...');
  const oldSnapshots = await sql`
    SELECT 
      COUNT(*) AS total_old,
      COUNT(*) FILTER (WHERE is_displaced IS TRUE) AS displaced_protected,
      COUNT(*) FILTER (WHERE is_displaced IS NOT TRUE) AS eligible_for_cleanup
    FROM keyword_pins_snapshots
    WHERE snapshot_date < CURRENT_DATE - INTERVAL '30 days';
  `;
  console.log('    Old snapshots count (>30d):', oldSnapshots[0]);

  // Clean old snapshots older than 30 days ONLY if is_displaced is FALSE or NULL
  if (Number(oldSnapshots[0].eligible_for_cleanup) > 0) {
    console.log(`[*] Cleaning ${oldSnapshots[0].eligible_for_cleanup} expired SERP snapshots (> 30 days) in batches of 5000...`);
    let totalDeleted = 0;
    while (true) {
      const deletedRows = await sql`
        DELETE FROM keyword_pins_snapshots
        WHERE id IN (
          SELECT id FROM keyword_pins_snapshots
          WHERE snapshot_date < CURRENT_DATE - INTERVAL '30 days'
            AND (is_displaced IS FALSE OR is_displaced IS NULL)
          LIMIT 5000
        )
        RETURNING id;
      `;
      totalDeleted += deletedRows.length;
      console.log(`    Chunk deleted: ${deletedRows.length} rows (total: ${totalDeleted})`);
      if (deletedRows.length < 5000) break;
    }
    console.log(`    Cleanup complete: ${totalDeleted} expired snapshots deleted.`);
  } else {
    console.log('    No expired SERP snapshots need cleanup (>30d is clean).');
  }

  console.log('\n[*] Step 3: Executing VACUUM & ANALYZE on Target Tables...');
  const targetTables = [
    'keyword_pins_snapshots',
    'keyword_displaced_pins',
    'competitor_pins',
    'pa_pins',
    'tracked_keywords',
    'tracked_boards',
    'competitor_profiles',
    'competitor_history_snapshots',
    'competitor_seed_pins',
    'keyword_folders',
    'keyword_folder_items',
    'schema_migrations'
  ];

  for (const tbl of targetTables) {
    try {
      console.log(`    Running VACUUM (ANALYZE) on ${tbl}...`);
      await sql(`VACUUM (ANALYZE) ${tbl}`);
      console.log(`    ✓ ${tbl} vacuumed & analyzed successfully.`);
    } catch (err) {
      console.warn(`    ⚠️ VACUUM direct execution note for ${tbl}: ${err.message}`);
      // Fallback: If VACUUM cannot run in transaction block over HTTP driver, run ANALYZE
      try {
        console.log(`    Attempting ANALYZE on ${tbl}...`);
        await sql(`ANALYZE ${tbl}`);
        console.log(`    ✓ ${tbl} analyzed successfully.`);
      } catch (err2) {
        console.error(`    ❌ Failed to analyze ${tbl}: ${err2.message}`);
      }
    }
  }

  console.log('\n[*] Step 4: Post-Optimization Statistics Verification...');
  const postStats = await sql`
    SELECT 
      relname AS table_name,
      n_live_tup AS live_tuples,
      n_dead_tup AS dead_tuples,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size
    FROM pg_stat_user_tables
    WHERE relname IN (
      'keyword_pins_snapshots', 
      'keyword_displaced_pins', 
      'competitor_pins', 
      'pa_pins', 
      'tracked_keywords'
    )
    ORDER BY n_dead_tup DESC;
  `;

  console.table(postStats);
  console.log('\n================================================================');
  console.log('✓ PHASE 5 DB STORAGE OPTIMIZATION COMPLETE');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
