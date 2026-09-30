#!/usr/bin/env node

/**
 * Neon Postgres Index Optimization Script
 * Creates critical indexes for sub-millisecond query performance:
 * - cluster_arbitrage_metrics (seed_pin_id, analyzed_at DESC)
 * - candidate_graph_nodes (candidate_pin_id)
 * - seed_guided_search_capsules (seed_pin_id, discovered_at DESC)
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] DATABASE_URL is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function optimizeIndexes() {
  console.log('[*] Optimizing Neon Database Indexes...');

  console.log('[*] 1. Indexing cluster_arbitrage_metrics(seed_pin_id, analyzed_at DESC)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_metrics_seed_pin_analyzed 
    ON cluster_arbitrage_metrics (seed_pin_id, analyzed_at DESC);
  `;

  console.log('[*] 2. Indexing candidate_graph_nodes(candidate_pin_id)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_candidate_pin 
    ON candidate_graph_nodes (candidate_pin_id);
  `;

  console.log('[*] 3. Indexing seed_guided_search_capsules(seed_pin_id, discovered_at DESC)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_capsules_seed_discovered 
    ON seed_guided_search_capsules (seed_pin_id, discovered_at DESC);
  `;

  console.log('[*] 4. Indexing candidate_graph_nodes partial index for un-enriched nodes...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_enrichment_queue 
    ON candidate_graph_nodes (seed_pin_id) 
    WHERE (repins = 0 OR repins IS NULL) AND saves > 0;
  `;

  console.log('[*] 5. Indexing P4 pa_pins & metrics...');
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_created_at_pinterest ON pa_pins(created_at_pinterest DESC NULLS LAST);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_annotations_gin ON pa_pins USING gin(annotations);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_staged_pins_status ON pa_staged_pins(status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pin_metrics_lookup ON pa_pin_metrics(pin_id, recorded_at DESC);`;

  console.log('[*] 6. Indexing P2 competitor_boards & snapshots...');
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_boards_lookup ON competitor_boards(competitor_id, pin_count DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_history_lookup ON competitor_history_snapshots(competitor_id, recorded_date DESC);`;

  console.log('[+] All indexes verified and active in Neon Serverless Postgres!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
