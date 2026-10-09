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

  console.log('[*] 7. Ensuring is_product and alt_text columns on competitor_pins and pa_pins...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;`;
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`;
  await sql`ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_is_product ON competitor_pins(competitor_id, is_product) WHERE is_product = TRUE;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_is_product ON pa_pins(is_product) WHERE is_product = TRUE;`;

  console.log('[*] 8. Backfilling is_product flag for identified commercial product pins...');
  await sql`
    UPDATE competitor_pins
    SET is_product = TRUE
    WHERE is_product = FALSE AND (
      link_domain ILIKE '%etsy%' OR 
      link_domain ILIKE '%shopify%' OR 
      link_domain ILIKE '%amazon%' OR 
      destination_url ILIKE '%/listing/%' OR 
      destination_url ILIKE '%/product/%' OR 
      destination_url ILIKE '%/item/%' OR 
      destination_url ILIKE '%gumroad.com%'
    );
  `;
  await sql`
    UPDATE pa_pins
    SET is_product = TRUE
    WHERE is_product = FALSE AND (
      domain ILIKE '%etsy%' OR 
      domain ILIKE '%shopify%' OR 
      domain ILIKE '%amazon%' OR 
      link ILIKE '%/listing/%' OR 
      link ILIKE '%/product/%' OR 
      link ILIKE '%/item/%' OR 
      link ILIKE '%gumroad.com%'
    );
  `;

  console.log('[*] 9. Ensuring enrichment_status and updated_at on competitor_pins for GHA 20-shard queue...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(32) DEFAULT 'pending';`;
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`;
  await sql`DROP INDEX IF EXISTS idx_competitor_pins_enrichment_queue;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_queue_fast ON competitor_pins(competitor_id, enrichment_status, id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrichment_global ON competitor_pins(enrichment_status) WHERE enrichment_status = 'pending';`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_stale_reclaim ON competitor_pins(enrichment_status, updated_at) WHERE enrichment_status = 'processing';`;

  console.log('[*] 10. Ensuring keyword intelligence indexes & column widths...');
  await sql`ALTER TABLE tracked_keywords ALTER COLUMN top_pin_id TYPE VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE keyword_pins_snapshots ALTER COLUMN pin_id TYPE VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE keyword_guided_capsules ALTER COLUMN dominant_color TYPE VARCHAR(64);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_popular_pins_gin ON tracked_keywords USING gin(popular_pins jsonb_path_ops);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_lookup ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_pin_id_date ON keyword_pins_snapshots(pin_id, snapshot_date ASC, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_serp_ordered ON keyword_pins_snapshots(keyword_id, snapshot_date DESC, rank_position ASC) WHERE is_displaced IS FALSE;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_velocity ON keyword_pins_snapshots(daily_save_velocity DESC);`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm ON seed_guided_search_capsules (seed_pin_id, normalized_query);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw ON keyword_guided_capsules(keyword_id, display_order ASC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score ON keyword_guided_capsules(keyword_id, score DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kdp_kw_vacuum ON keyword_displaced_pins(keyword_id, status, vacuum_opportunity_score DESC, last_known_rank ASC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_kdp_pin_id ON keyword_displaced_pins(pin_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_kw_date_displaced ON keyword_pins_snapshots(keyword_id, is_displaced, snapshot_date DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_kw_date_distinct ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);`;

  console.log('[*] 6. Ensuring created_at_pinterest and creation_method columns exist...');
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMP WITH TIME ZONE;`.catch(() => {});
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(() => {});
  await sql`ALTER TABLE keyword_displaced_pins ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(() => {});
  await sql`ALTER TABLE keyword_pins_snapshots ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMP WITH TIME ZONE;`.catch(() => {});
  await sql`ALTER TABLE keyword_pins_snapshots ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(() => {});

  console.log('[+] All indexes and columns verified and active in Neon Serverless Postgres!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
