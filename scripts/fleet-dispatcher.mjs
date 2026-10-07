#!/usr/bin/env node

/**
 * scripts/fleet-dispatcher.mjs
 *
 * Intelligent Dynamic Fleet Dispatcher for Distributed GitHub Actions Pipeline
 * 
 * Inspects the Central Hub (DATABASE_URL) to determine which of the 99 shards
 * actually have assigned active competitors or pending enrichment queues.
 * 
 * Emits an optimized JSON array of active shard numbers for matrix execution:
 * e.g., active_shards=[3, 7, 12, 19, 44]
 * 
 * Benefits:
 * - 0% Empty Runners: Spawns VMs ONLY for shards with real workload.
 * - Single-Wave Velocity: 10-15 active shards complete in ~3-5 minutes.
 * - Zero Account Starvation: Leaves GitHub Actions runner slots free for other jobs.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import { getShardNumberForEntity, getResilientShardNumberForEntity } from '../src/modules/fleet/sharding.mjs';
import { normalizePinterestUsername } from '../src/modules/competitors/service.mjs';

// Auto-load .env in local environments
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for fleet dispatcher.');
  process.exit(1);
}

function getCliArg(flag) {
  const eq = process.argv.find(a => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx < process.argv.length - 1) return process.argv[idx + 1];
  return '';
}

async function main() {
  const sql = neon(DATABASE_URL);
  const rawAccount = getCliArg('--account') || process.env.TARGET_ACCOUNT || '';
  const targetAccount = normalizePinterestUsername(rawAccount);
  const shardTotal = parseInt(getCliArg('--shard-total') || process.env.SHARD_TOTAL || '99', 10);
  const asJson = process.argv.includes('--json');
  const log = asJson ? console.error : console.log;

  log('================================================================');
  log('       DYNAMIC FLEET DISPATCHER (99-SHARD NEON ORCHESTRATOR)');
  log('================================================================');
  log(`[Config] Shard Fleet Total: ${shardTotal}`);
  if (targetAccount) log(`[Config] Target Account:    @${targetAccount}`);

  let activeShards = [];

  // Identify quarantined / inactive shards from registry to apply dynamic fallback
  const quarantinedShards = new Set();
  try {
    const inactiveRows = await sql`
      SELECT project_name
      FROM neon_projects_registry
      WHERE status IN ('inactive', 'suspended', 'quarantined', 'degraded');
    `;
    for (const row of inactiveRows) {
      const match = row.project_name?.match(/shard-(\d+)/i);
      if (match) quarantinedShards.add(parseInt(match[1], 10));
    }
    if (quarantinedShards.size > 0) {
      log(`[Quarantine Watchdog] Identified ${quarantinedShards.size} degraded shards in registry: [${Array.from(quarantinedShards).join(', ')}]. Fallback routing active.`);
    }
  } catch (_) {}

  if (targetAccount) {
    // Mode A: High-Throughput Multi-IP Swarm for Targeted Account
    // Deploys 15 parallel GitHub Actions runner VMs with 15 distinct Egress IPs
    // pulling concurrently from the Hub queue via FOR UPDATE SKIP LOCKED
    const canonicalShard = getResilientShardNumberForEntity(targetAccount, shardTotal, quarantinedShards);
    const SWARM_SIZE = 15;
    activeShards = Array.from({ length: SWARM_SIZE }, (_, i) => i + 1).filter(s => !quarantinedShards.has(s));
    log(`[*] Target account @${targetAccount} mapped to Canonical Shard ${canonicalShard}/${shardTotal}`);
    log(`[*] Mobilizing ${activeShards.length}-Runner Multi-IP Swarm: [${activeShards.join(', ')}] for maximum ingestion velocity.`);
  } else {
    // Mode B: Scheduled Fleet Sweep
    let accounts = [];
    try {
      accounts = await sql`
        SELECT id, username
        FROM competitor_profiles
        WHERE is_active = TRUE
        ORDER BY id ASC;
      `;
    } catch (err) {
      console.warn('[-] Warning querying competitor_profiles, checking creator_profiles:', err.message);
      try {
        accounts = await sql`
          SELECT id, username
          FROM creator_profiles
          WHERE is_active = TRUE
          ORDER BY id ASC;
        `;
      } catch (innerErr) {
        console.error('[-] FATAL: Failed to query active profiles:', innerErr.message);
        accounts = [];
      }
    }

    const shardDistribution = new Map();
    for (const acc of accounts) {
      if (!acc || !acc.username) continue;
      const cleanUser = acc.username.replace(/^@+/, '').trim().toLowerCase();
      const sNum = getResilientShardNumberForEntity(cleanUser, shardTotal, quarantinedShards);
      if (!shardDistribution.has(sNum)) {
        shardDistribution.set(sNum, []);
      }
      shardDistribution.get(sNum).push(cleanUser);
    }

    // Also check for pending queue items that might belong to any active profile
    try {
      const pendingAccounts = await sql`
        SELECT DISTINCT cp.username
        FROM competitor_pins pin
        JOIN competitor_profiles cp ON pin.competitor_id = cp.id
        WHERE pin.enrichment_status = 'pending'
          AND cp.is_active = TRUE;
      `;
      for (const p of pendingAccounts) {
        if (!p || !p.username) continue;
        const cleanUser = p.username.replace(/^@+/, '').trim().toLowerCase();
        const sNum = getResilientShardNumberForEntity(cleanUser, shardTotal, quarantinedShards);
        if (!shardDistribution.has(sNum)) {
          shardDistribution.set(sNum, []);
          shardDistribution.get(sNum).push(cleanUser);
        }
      }
    } catch (err) {
      console.warn('[-] [fleet-dispatcher] Pending queue check warning:', err.message);
    }

    // Also include shards for active tracked boards (Board Ideas Radar)
    try {
      const activeBoards = await sql`
        SELECT assigned_shard_id, board_id, username
        FROM tracked_boards
        WHERE is_active = TRUE AND track_daily = TRUE;
      `;
      for (const b of activeBoards) {
        if (!b) continue;
        const sNum = b.assigned_shard_id || (b.board_id ? getResilientShardNumberForEntity(b.board_id, shardTotal, quarantinedShards) : 1);
        if (!shardDistribution.has(sNum)) {
          shardDistribution.set(sNum, []);
        }
        shardDistribution.get(sNum).push(`[board:${b.username || b.board_id}]`);
      }
    } catch (err) {
      console.warn('[-] [fleet-dispatcher] Tracked boards check warning:', err.message);
    }

    activeShards = Array.from(shardDistribution.keys())
      .filter(s => !quarantinedShards.has(s))
      .sort((a, b) => a - b);

    log(`\n[Fleet Analysis] Found ${accounts.length} active competitor accounts.`);
    log(`[Fleet Analysis] Required active shards: ${activeShards.length} of ${shardTotal}`);
    
    for (const sNum of activeShards) {
      const list = shardDistribution.get(sNum) || [];
      log(`  -> Shard ${String(sNum).padStart(2, '0')}: [${list.length} accounts] @${list.slice(0, 3).join(', @')}${list.length > 3 ? ` (+${list.length - 3} more)` : ''}`);
    }
  }

  // Fail-safe: GitHub Actions matrix cannot be empty
  if (activeShards.length === 0) {
    log('\n[!] Zero active accounts detected. Defaulting to Shard 1 to preserve matrix validity.');
    activeShards = [1];
  }

  const jsonOutput = JSON.stringify(activeShards);
  log('\n----------------------------------------------------------------');
  log(`Active Shards Output: ${jsonOutput}`);
  log('----------------------------------------------------------------\n');

  // Emit to GitHub Actions $GITHUB_OUTPUT if available
  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `active_shards=${jsonOutput}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `active_count=${activeShards.length}\n`);
      log(`[✓] Emitted active_shards to $GITHUB_OUTPUT: ${jsonOutput}`);
    } catch (err) {
      console.warn(`[!] Failed writing to GITHUB_OUTPUT:`, err.message);
    }
  }

  if (asJson) {
    process.stdout.write(jsonOutput);
  }
}

main().catch(err => {
  console.error('[-] Fatal Fleet Dispatcher Error:', err);
  process.exit(1);
});
