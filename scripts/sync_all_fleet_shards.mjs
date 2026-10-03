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
  console.log('   Propagating Hub Competitors & Boards across all Shards');
  console.log('================================================================');

  const t0 = Date.now();
  const res = await syncFleetDatabases(sql);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log(`🎉 Fleet Synchronization Complete in ${elapsed}s!`);
  console.log(`   Total Active Shards:      ${res.total_shards}`);
  console.log(`   Successfully Synced:      ${res.successful_shards}`);
  console.log(`   Profiles Replicated:      ${res.profiles_count}`);
  console.log(`   Boards Replicated:        ${res.boards_count}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('[-] Fleet Sync Fatal Error:', err);
  process.exit(1);
});
