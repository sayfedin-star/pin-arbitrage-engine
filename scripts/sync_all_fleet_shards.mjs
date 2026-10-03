#!/usr/bin/env node

/**
 * scripts/sync_all_fleet_shards.mjs
 *
 * Full fleet synchronization runner.
 * Propagates all competitor profiles and discovered boards from the Hub
 * across all active Neon shards in neon_projects_registry.
 */

import { neon } from '@neondatabase/serverless';
import { syncFleetDatabases } from '../src/modules/fleet/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log('================================================================');
  console.log('🔄 Neon Multi-Project Fleet Synchronization');
  console.log('   Propagating Hub Creators, Boards, Pins & Metrics across all Shards');
  console.log('================================================================');

  // Update Hub stats in registry first
  const [hProfiles] = await sql`SELECT count(*)::int as c FROM competitor_profiles;`;
  const [hBoards] = await sql`SELECT count(*)::int as c FROM competitor_boards;`;
  const [hPins] = await sql`SELECT count(*)::int as c FROM pa_pins;`;
  await sql`
    UPDATE neon_projects_registry
    SET stats = jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(hProfiles.c)}::jsonb),
        '{boards}', ${JSON.stringify(hBoards.c)}::jsonb
      ),
      '{pins}', ${JSON.stringify(hPins.c)}::jsonb
    ),
    updated_at = NOW()
    WHERE is_hub = TRUE;
  `;

  const t0 = Date.now();
  const res = await syncFleetDatabases(sql);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log(`🎉 Fleet Synchronization Complete in ${elapsed}s!`);
  console.log(`   Total Active Shards:      ${res.total_shards}`);
  console.log(`   Successfully Synced:      ${res.successful_shards}`);
  console.log(`   Profiles Replicated:      ${res.profiles_count}`);
  console.log(`   Boards Replicated:        ${res.boards_count}`);
  console.log(`   Pins Replicated:          ${res.pins_count}`);
  console.log(`   Metrics Replicated:       ${res.metrics_count}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('[-] Fleet Sync Fatal Error:', err);
  process.exit(1);
});
