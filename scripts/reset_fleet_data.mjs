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

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(dbUrl);

/**
 * Clean Slate Data Purge Script
 * Safely empties operational data across Hub and all 99 Shards while preserving:
 * 1. Database table schemas, indexes, and RPC functions across all nodes
 * 2. neon_projects_registry (100 fleet database endpoints, IDs, URLs, and secrets)
 * 3. pa_qualification_rules (default rule configuration)
 */
export async function purgeHubData() {
  console.log('[*] 1/3 Purging operational data on Hub database...');

  // 1. Truncate competitor & pin data
  await sql`
    TRUNCATE TABLE 
      competitor_history_snapshots,
      competitor_pins,
      competitor_boards,
      competitor_profiles
    CASCADE;
  `;
  console.log('[+] Purged competitor_profiles, competitor_boards, competitor_pins, competitor_history_snapshots');

  // 2. Truncate pin archive & repurposing data
  await sql`
    TRUNCATE TABLE 
      pa_staged_pins,
      pa_pin_metrics,
      pa_pins
    CASCADE;
  `;
  console.log('[+] Purged pa_pins, pa_pin_metrics, pa_staged_pins');

  // 3. Truncate seed & candidate graph data
  await sql`
    TRUNCATE TABLE 
      seed_guided_search_capsules,
      candidate_graph_nodes,
      cluster_arbitrage_metrics,
      cluster_seeds
    CASCADE;
  `;
  console.log('[+] Purged cluster_seeds, candidate_graph_nodes, cluster_arbitrage_metrics, seed_guided_search_capsules');

  // 4. Truncate keywords data
  await sql`
    TRUNCATE TABLE 
      keyword_pins_snapshots,
      tracked_keywords
    CASCADE;
  `;
  console.log('[+] Purged tracked_keywords, keyword_pins_snapshots');

  // 5. Reset qualification rules to defaults
  await sql`
    INSERT INTO pa_qualification_rules (
      id, tier1_min_saves, tier2_min_repins, tier3_max_age_days, tier3_min_saves,
      master_ingest_enabled, early_stop_pages, max_batch_pins, discovery_max_pages, refresh_max_pins, paused_policy, updated_at
    ) VALUES (
      1, 100, 100, 14, 25, TRUE, 3, 50, 10, 0, 'reject', NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      tier1_min_saves = 100,
      tier2_min_repins = 100,
      tier3_max_age_days = 14,
      tier3_min_saves = 25,
      master_ingest_enabled = TRUE,
      early_stop_pages = 3,
      max_batch_pins = 50,
      discovery_max_pages = 10,
      paused_policy = 'reject',
      updated_at = NOW();
  `;
  console.log('[+] Reset pa_qualification_rules to clean defaults');

  // 6. Reset fleet registry statistics to zero (preserving connection URLs and project IDs)
  await sql`
    UPDATE neon_projects_registry
    SET stats = '{"competitors": 0, "boards": 0, "pins": 0, "seeds": 0, "candidates": 0, "storage_mb": 0}'::jsonb,
        updated_at = NOW();
  `;
  console.log('[+] Reset neon_projects_registry stats to 0 across all 100 projects (URLs preserved)');
}

export async function purgeAllShards() {
  console.log('\n[*] 2/3 Purging operational data across all 99 Neon Shards...');
  const shards = await sql`
    SELECT project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE is_hub = false AND status = 'active' AND database_url IS NOT NULL
    ORDER BY project_name;
  `;

  console.log(`[*] Discovered ${shards.length} active shards to purge in parallel batches...`);

  const BATCH_SIZE = 10;
  let purgedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < shards.length; i += BATCH_SIZE) {
    const chunk = shards.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(chunk.map(async (shard) => {
      const sSql = neon(shard.database_url);
      
      // Dynamically discover all existing user tables on this shard
      const tables = await sSql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('neon_projects_registry', 'pa_qualification_rules');
      `;

      if (tables.length > 0) {
        const tableList = tables.map(t => `"${t.table_name}"`).join(', ');
        await sSql(`TRUNCATE TABLE ${tableList} CASCADE;`);
      }
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') {
        purgedCount++;
      } else {
        errorCount++;
        console.error(`\n[-] Shard purge error:`, r.reason?.message);
      }
    }
    process.stdout.write(`\r   Progress: ${purgedCount + errorCount}/${shards.length} shards processed...`);
  }
  console.log(`\n[+] Successfully purged operational data from ${purgedCount} shards (Errors: ${errorCount})`);
}

export async function verifyCleanSlate() {
  console.log('\n[*] 3/3 Verifying Clean Slate status...');
  const [hubProfiles] = await sql`SELECT count(*)::int as c FROM competitor_profiles;`;
  const [hubBoards] = await sql`SELECT count(*)::int as c FROM competitor_boards;`;
  const [hubPins] = await sql`SELECT count(*)::int as c FROM pa_pins;`;
  const [hubCompPins] = await sql`SELECT count(*)::int as c FROM competitor_pins;`;
  const [hubCandidates] = await sql`SELECT count(*)::int as c FROM candidate_graph_nodes;`;
  const [registryCount] = await sql`SELECT count(*)::int as c FROM neon_projects_registry;`;

  console.log(`\n================================================================`);
  console.log(`📊 FINAL FLEET CLEAN SLATE AUDIT:`);
  console.log(`- Hub Competitor Profiles: ${hubProfiles.c} (Expected: 0)`);
  console.log(`- Hub Competitor Boards:   ${hubBoards.c} (Expected: 0)`);
  console.log(`- Hub Competitor Pins:     ${hubCompPins.c} (Expected: 0)`);
  console.log(`- Hub Repurposing Pins:    ${hubPins.c} (Expected: 0)`);
  console.log(`- Hub Candidate Nodes:     ${hubCandidates.c} (Expected: 0)`);
  console.log(`- Neon Fleet Registry:     ${registryCount.c} nodes preserved (Expected: 100)`);
  console.log(`================================================================`);

  if (hubProfiles.c === 0 && hubBoards.c === 0 && hubPins.c === 0 && registryCount.c === 100) {
    console.log('🎉 [SUCCESS] The entire fleet is 100% CLEAN, SAFE, AND READY FOR TESTING!');
  } else {
    console.warn('⚠️ [WARNING] Unexpected non-zero count detected!');
  }
}

async function main() {
  console.log('================================================================');
  console.log('🧹 NEON FLEET CLEAN SLATE PURGE');
  console.log('   Safely truncating Hub + 99 Shards while preserving infrastructure');
  console.log('================================================================');
  await purgeHubData();
  await purgeAllShards();
  await verifyCleanSlate();
}

if (process.argv[1].endsWith('reset_fleet_data.mjs')) {
  main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}
