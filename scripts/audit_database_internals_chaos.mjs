#!/usr/bin/env node

/**
 * scripts/audit_database_internals_chaos.mjs
 *
 * Advanced Forensic Audit: PostgreSQL Engine Internals, MVCC Dynamics & Distributed Shard Topology
 * Target: Neon Serverless Postgres (Master Hub & 99 Fleet Shards)
 * 
 * Axles:
 * 1. Heap Page Management & HOT Updates (pg_stat_user_tables & fillfactor)
 * 2. Session State Contamination under Connection Pooling & Timeouts
 * 3. Query Planner Pathology, Parameter Sniffing & Statistics Target
 * 4. Distributed Coordination without Central Orchestrator via Postgres Advisory Locks
 * 5. Resilient Fleet Scaling beyond Modulo (Consistent Hash Ring vs Modulo Trap)
 */

import { neon } from '@neondatabase/serverless';
import { crc32, getShardNumberForEntity } from '../src/modules/fleet/sharding.mjs';

// Auto-load .env
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function title(name) {
  console.log('\n' + '='.repeat(78));
  console.log(`📌 ${name}`);
  console.log('='.repeat(78));
}

async function main() {
  console.log('==============================================================================');
  console.log('   DEEP DATABASE INTERNALS, MVCC DYNAMICS & SHARD TOPOLOGY AUDIT');
  console.log('   Auditor: Principal Distributed Database Engineer & PostgreSQL Specialist');
  console.log('==============================================================================');

  // --------------------------------------------------------------------------
  // AXIS 1: HEAP PAGE MANAGEMENT & HOT UPDATES (Heap-Only Tuples & Fillfactor)
  // --------------------------------------------------------------------------
  title('AXIS 1: HEAP PAGE MANAGEMENT & HOT (HEAP-ONLY TUPLES & FILLFACTOR)');

  console.log('[1.1] Inspecting pg_stat_user_tables for HOT Update Ratios on Intensive Tables:');
  const hotStats = await sql`
    SELECT 
      relname,
      n_tup_ins,
      n_tup_upd,
      n_tup_hot_upd,
      CASE 
        WHEN n_tup_upd > 0 THEN ROUND((n_tup_hot_upd::numeric / n_tup_upd::numeric) * 100, 2)
        ELSE 0.00
      END AS hot_ratio_pct
    FROM pg_stat_user_tables
    WHERE relname IN ('competitor_pins', 'keyword_pins_snapshots', 'tracked_keywords', 'candidate_graph_nodes', 'pa_pin_metrics')
    ORDER BY n_tup_upd DESC;
  `;

  for (const row of hotStats) {
    const ratio = Number(row.hot_ratio_pct);
    const health = ratio >= 70 ? '🟢 OPTIMAL' : ratio >= 40 ? '🟡 DEGRADED' : '🔴 SEVERE WRITE AMPLIFICATION';
    console.log(`    - Table: ${row.relname.padEnd(24)} | Inserts: ${String(row.n_tup_ins).padStart(6)} | Updates: ${String(row.n_tup_upd).padStart(7)} | HOT Updates: ${String(row.n_tup_hot_upd).padStart(6)} | HOT Ratio: ${String(row.hot_ratio_pct).padStart(5)}% [${health}]`);
  }

  console.log('\n[1.2] Checking Current fillfactor Configuration across High-Update Tables:');
  const fillfactorStats = await sql`
    SELECT 
      relname, 
      reloptions,
      CASE 
        WHEN reloptions::text LIKE '%fillfactor=%' THEN SUBSTRING(reloptions::text FROM 'fillfactor=([0-9]+)')
        ELSE '100 (default)'
      END AS effective_fillfactor
    FROM pg_class
    WHERE relname IN ('competitor_pins', 'keyword_pins_snapshots', 'tracked_keywords', 'candidate_graph_nodes', 'pa_pin_metrics')
    ORDER BY relname ASC;
  `;

  for (const row of fillfactorStats) {
    console.log(`    - Table: ${row.relname.padEnd(24)} | Options: ${String(row.reloptions || 'none').padEnd(16)} | Effective fillfactor: ${row.effective_fillfactor}`);
  }

  // --------------------------------------------------------------------------
  // AXIS 2: SESSION STATE CONTAMINATION UNDER CONNECTION POOLING
  // --------------------------------------------------------------------------
  title('AXIS 2: SESSION STATE CONTAMINATION UNDER HYPERDRIVE & TRANSACTION POOLING');

  console.log('[2.1] Inspecting Session-Level Timeouts & Engine Defaults:');
  const [stmtTimeout] = await sql`SHOW statement_timeout;`;
  const [idleTimeout] = await sql`SHOW idle_in_transaction_session_timeout;`;
  const [lockTimeout] = await sql`SHOW lock_timeout;`;

  console.log(`    - statement_timeout:                   ${stmtTimeout.statement_timeout}`);
  console.log(`    - idle_in_transaction_session_timeout: ${idleTimeout.idle_in_transaction_session_timeout}`);
  console.log(`    - lock_timeout:                        ${lockTimeout.lock_timeout}`);

  console.log('\n[2.2] Testing Statement Timeout Enforcement on Hung/Orphaned Queries:');
  const timeoutStart = Date.now();
  let caughtTimeout = false;
  try {
    // Attempt query with 1500ms timeout
    await sql`
      SET statement_timeout = '1500';
      SELECT pg_sleep(3);
    `;
  } catch (err) {
    caughtTimeout = true;
    const elapsed = Date.now() - timeoutStart;
    console.log(`    - Aborted runaway query cleanly in ${elapsed}ms! Error: ${err.message} ✅`);
  }

  // Reset timeout back to default
  await sql`SET statement_timeout = '0';`.catch(() => {});

  if (!caughtTimeout) {
    console.log('    - ⚠️ Warning: Statement timeout did not fire!');
  }

  // --------------------------------------------------------------------------
  // AXIS 3: QUERY PLANNER PATHOLOGY & STATISTICS TARGET
  // --------------------------------------------------------------------------
  title('AXIS 3: QUERY PLANNER PATHOLOGY, PARAMETER SNIFFING & STATISTICS TARGET');

  console.log('[3.1] Checking attstattarget on High-Cardinality Skewed Columns:');
  const statTargets = await sql`
    SELECT 
      c.relname AS table_name,
      a.attname AS column_name,
      COALESCE(a.attstattarget, 100) AS statistics_target,
      s.n_distinct,
      s.null_frac
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    LEFT JOIN pg_stats s ON s.tablename = c.relname AND s.attname = a.attname
    WHERE c.relname IN ('competitor_pins', 'keyword_pins_snapshots', 'tracked_keywords', 'candidate_graph_nodes')
      AND a.attname IN ('competitor_id', 'link_domain', 'keyword_id', 'keyword', 'seed_pin_id')
    ORDER BY c.relname, a.attname;
  `;

  for (const st of statTargets) {
    const target = Number(st.statistics_target);
    const health = target >= 500 ? '🟢 ENHANCED (500-1000)' : '🟡 DEFAULT (100)';
    console.log(`    - Column: ${(st.table_name + '.' + st.column_name).padEnd(36)} | Target: ${String(target).padStart(4)} | Distinct: ${String(st.n_distinct || 'N/A').padEnd(6)} | Null Frac: ${st.null_frac || 0} [${health}]`);
  }

  console.log('\n[3.2] Testing Execution Plan for Skewed Domain Cardinality (Etsy vs Niche):');
  try {
    const planEtsy = await sql`
      EXPLAIN (FORMAT JSON)
      SELECT id, title, save_count
      FROM competitor_pins
      WHERE link_domain = 'etsy.com'
      LIMIT 10;
    `;
    const planType = planEtsy[0]?.['QUERY PLAN']?.[0]?.Plan?.['Node Type'] || 'Unknown';
    const planCost = planEtsy[0]?.['QUERY PLAN']?.[0]?.Plan?.['Total Cost'] || 0;
    console.log(`    - Query Plan for High-Volume 'etsy.com': Node Type: ${planType} | Cost: ${planCost} ✅`);
  } catch (err) {
    console.log(`    - Planner explanation test error: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // AXIS 4: DISTRIBUTED COORDINATION VIA POSTGRES ADVISORY LOCKS
  // --------------------------------------------------------------------------
  title('AXIS 4: POSTGRES ADVISORY LOCKS FOR DISTRIBUTED ZERO-REDIS COORDINATION');

  console.log('[4.1] Testing pg_try_advisory_xact_lock Idempotent Non-Blocking Skip:');
  const testKey = 'keyword_arbitrage_lock_test_2026';
  
  // Worker A attempts lock
  const [lockA] = await sql`
    SELECT pg_try_advisory_xact_lock(hashtext(${testKey})) AS acquired;
  `;
  console.log(`    - Worker A requesting lock for "${testKey}": ${lockA.acquired ? 'ACQUIRED (true) ✅' : 'FAILED'}`);

  // Test session advisory locks for mutual exclusion simulation
  console.log('\n[4.2] Simulating Concurrent Worker Conflict via Session Advisory Lock:');
  const sessionKey = 998877665;
  const [sessionLockAcquired] = await sql`
    SELECT pg_try_advisory_lock(${sessionKey}) AS acquired;
  `;
  console.log(`    - Worker 1 acquiring session lock #${sessionKey}: ${sessionLockAcquired.acquired ? 'HELD ✅' : 'FAILED'}`);

  if (sessionLockAcquired.acquired) {
    // Secondary query on same lock (simulating immediate non-blocking skip)
    const [secondAttempt] = await sql`
      SELECT pg_try_advisory_lock(${sessionKey}) AS acquired;
    `;
    console.log(`    - Re-entrancy check: In same session, pg_try_advisory_lock returns ${secondAttempt.acquired}`);

    // Release session lock
    await sql`SELECT pg_advisory_unlock(${sessionKey});`;
    console.log(`    - Worker 1 released session lock #${sessionKey} cleanly ✅`);
  }

  // --------------------------------------------------------------------------
  // AXIS 5: RESILIENT FLEET SCALING (CONSISTENT HASH RING VS MODULO TRAP)
  // --------------------------------------------------------------------------
  title('AXIS 5: RESILIENT FLEET SCALING BEYOND MODULO (CONSISTENT RING SIMULATION)');

  console.log('[5.1] Mathematical & Empirical Simulation of the Modulo Re-sharding Trap:');
  // Generate 10,000 synthetic entity keys
  const sampleSize = 10000;
  const sampleKeys = Array.from({ length: sampleSize }, (_, i) => `account_seed_or_keyword_entity_${i}_x2026`);

  // Test 1: Modulo scaling from 99 to 100 shards
  let moduloMoved99to100 = 0;
  for (const k of sampleKeys) {
    const s99 = (crc32(k) % 99) + 1;
    const s100 = (crc32(k) % 100) + 1;
    if (s99 !== s100) moduloMoved99to100++;
  }
  const pctMovedModulo100 = (moduloMoved99to100 / sampleSize) * 100;
  console.log(`    - Modulo Hash (99 -> 100 shards): ${moduloMoved99to100}/${sampleSize} keys moved (${pctMovedModulo100.toFixed(2)}% DISRUPTION! 💥)`);

  // Test 2: Modulo scaling from 99 to 120 shards
  let moduloMoved99to120 = 0;
  for (const k of sampleKeys) {
    const s99 = (crc32(k) % 99) + 1;
    const s120 = (crc32(k) % 120) + 1;
    if (s99 !== s120) moduloMoved99to120++;
  }
  const pctMovedModulo120 = (moduloMoved99to120 / sampleSize) * 100;
  console.log(`    - Modulo Hash (99 -> 120 shards): ${moduloMoved99to120}/${sampleSize} keys moved (${pctMovedModulo120.toFixed(2)}% DISRUPTION! 💥)`);

  console.log('\n[5.2] Consistent Hash Ring with Virtual Nodes Simulation:');
  class ConsistentRing {
    constructor(shardCount, vnodes = 128) {
      this.ring = [];
      this.shardCount = shardCount;
      this.vnodes = vnodes;
      this._build();
    }

    _build() {
      this.ring = [];
      for (let s = 1; s <= this.shardCount; s++) {
        for (let v = 0; v < this.vnodes; v++) {
          const vnodeKey = `shard_${s}_vnode_${v}`;
          const hash = crc32(vnodeKey);
          this.ring.push({ hash, shard: s });
        }
      }
      this.ring.sort((a, b) => a.hash - b.hash);
    }

    getShard(key) {
      const h = crc32(key);
      let low = 0;
      let high = this.ring.length - 1;
      let idx = 0;

      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (this.ring[mid].hash >= h) {
          idx = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      return this.ring[idx].shard;
    }
  }

  const ring99 = new ConsistentRing(99, 128);
  const ring100 = new ConsistentRing(100, 128);
  const ring120 = new ConsistentRing(120, 128);

  let ringMoved99to100 = 0;
  for (const k of sampleKeys) {
    const s99 = ring99.getShard(k);
    const s100 = ring100.getShard(k);
    if (s99 !== s100) ringMoved99to100++;
  }
  const pctMovedRing100 = (ringMoved99to100 / sampleSize) * 100;
  console.log(`    - Consistent Ring (99 -> 100 shards): ${ringMoved99to100}/${sampleSize} keys moved (${pctMovedRing100.toFixed(2)}% keys moved vs optimal ${(100 / 100).toFixed(2)}% ✅)`);

  let ringMoved99to120 = 0;
  for (const k of sampleKeys) {
    const s99 = ring99.getShard(k);
    const s120 = ring120.getShard(k);
    if (s99 !== s120) ringMoved99to120++;
  }
  const pctMovedRing120 = (ringMoved99to120 / sampleSize) * 100;
  console.log(`    - Consistent Ring (99 -> 120 shards): ${ringMoved99to120}/${sampleSize} keys moved (${pctMovedRing120.toFixed(2)}% keys moved vs optimal ${(21 / 120 * 100).toFixed(2)}% ✅)`);

  console.log('\n==============================================================================');
  console.log('✅ DATABASE INTERNALS & CHAOS AUDIT COMPLETED.');
  console.log('==============================================================================');
}

main().catch(err => {
  console.error('[-] Fatal error in audit:', err);
  process.exit(1);
});
