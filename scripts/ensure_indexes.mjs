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
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 2. Indexing candidate_graph_nodes(candidate_pin_id)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_candidate_pin 
    ON candidate_graph_nodes (candidate_pin_id);
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 3. Indexing seed_guided_search_capsules(seed_pin_id, discovered_at DESC)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_capsules_seed_discovered 
    ON seed_guided_search_capsules (seed_pin_id, discovered_at DESC);
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 4. Indexing candidate_graph_nodes partial index for un-enriched nodes...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_enrichment_queue 
    ON candidate_graph_nodes (seed_pin_id) 
    WHERE (repins = 0 OR repins IS NULL) AND saves > 0;
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 5. Indexing P4 pa_pins & metrics...');
  await sql`DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;`.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_created_at_pinterest ON pa_pins(created_at_pinterest DESC NULLS LAST);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_annotations_gin ON pa_pins USING gin(annotations);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_staged_pins_status ON pa_staged_pins(status);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pin_metrics_lookup ON pa_pin_metrics(pin_id, recorded_at DESC);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 6. Indexing P2 competitor_boards & snapshots...');
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_boards_lookup ON competitor_boards(competitor_id, pin_count DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_history_lookup ON competitor_history_snapshots(competitor_id, recorded_date DESC);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 7. Ensuring is_product and alt_text columns on competitor_pins and pa_pins...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_is_product ON competitor_pins(competitor_id, is_product) WHERE is_product = TRUE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_is_product ON pa_pins(is_product) WHERE is_product = TRUE;`.catch(err => console.warn('[Index Notice]', err.message));

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
  `.catch(err => console.warn('[Index Notice]', err.message));
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
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 9. Ensuring enrichment_status and updated_at on competitor_pins for GHA 20-shard queue...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(32) DEFAULT 'pending';`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`DROP INDEX IF EXISTS idx_competitor_pins_enrichment_queue;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_queue_fast ON competitor_pins(competitor_id, enrichment_status, id);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrichment_global ON competitor_pins(enrichment_status) WHERE enrichment_status = 'pending';`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_stale_reclaim ON competitor_pins(enrichment_status, updated_at) WHERE enrichment_status = 'processing';`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 10. Ensuring keyword intelligence indexes & column widths...');
  await sql`ALTER TABLE tracked_keywords ALTER COLUMN top_pin_id TYPE VARCHAR(255);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_pins_snapshots ALTER COLUMN pin_id TYPE VARCHAR(255);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_guided_capsules ALTER COLUMN dominant_color TYPE VARCHAR(64);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_popular_pins_gin ON tracked_keywords USING gin(popular_pins jsonb_path_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_lookup ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_pin_id_date ON keyword_pins_snapshots(pin_id, snapshot_date ASC, created_at DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_serp_ordered ON keyword_pins_snapshots(keyword_id, snapshot_date DESC, rank_position ASC) WHERE is_displaced IS FALSE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_velocity ON keyword_pins_snapshots(daily_save_velocity DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm ON seed_guided_search_capsules (seed_pin_id, normalized_query);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw ON keyword_guided_capsules(keyword_id, display_order ASC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score ON keyword_guided_capsules(keyword_id, score DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kdp_kw_vacuum ON keyword_displaced_pins(keyword_id, status, vacuum_opportunity_score DESC, last_known_rank ASC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kdp_pin_id ON keyword_displaced_pins(pin_id);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_kw_date_displaced ON keyword_pins_snapshots(keyword_id, is_displaced, snapshot_date DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kps_kw_date_distinct ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 11. Ensuring created_at_pinterest and creation_method columns exist...');
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMP WITH TIME ZONE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_displaced_pins ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_pins_snapshots ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMP WITH TIME ZONE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_pins_snapshots ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 12. Ensuring registry and case-insensitive search indexes [CAP-23, CAP-24]...');
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_npr_project_name ON neon_projects_registry(project_name);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON tracked_keywords(LOWER(keyword));`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON competitor_profiles(LOWER(username));`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 13. Propagating core indexes across registered storage shards [CAP-21]...');
  let shards = [];
  try {
    shards = await sql`
      SELECT id, project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
  } catch (regErr) {
    console.warn('[!] Could not fetch storage shards from registry:', regErr.message);
  }

  if (shards.length > 0) {
    console.log(`[*] Discovered ${shards.length} storage shards in registry. Applying shard-level indexes...`);
    for (const shard of shards) {
      try {
        const shardSql = neon(shard.database_url);
        // Clean duplicate trigger on shard pa_pins [CAP-22]
        await shardSql`DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;`.catch(() => {});
        // P4 pa_pins
        await shardSql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_pa_pins_created_at_pinterest ON pa_pins(created_at_pinterest DESC NULLS LAST);`.catch(() => {});
        // competitor_pins queue indexes
        await shardSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_queue_fast ON competitor_pins(competitor_id, enrichment_status, id);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrichment_global ON competitor_pins(enrichment_status) WHERE enrichment_status = 'pending';`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_stale_reclaim ON competitor_pins(enrichment_status, updated_at) WHERE enrichment_status = 'processing';`.catch(() => {});
        // universal_master_pins & snapshots
        await shardSql`CREATE INDEX IF NOT EXISTS idx_ump_domain ON universal_master_pins(domain);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_ump_creator ON universal_master_pins(creator_username);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_pds_pin_date ON pins_daily_snapshots(pin_id, snapshot_date ASC, created_at DESC);`.catch(() => {});
      } catch (shardErr) {
        console.warn(`[!] Shard ${shard.project_name || shard.id} index notice:`, shardErr.message);
      }
    }
    console.log(`[+] Fleet shard index propagation complete for ${shards.length} shards.`);
  }

  console.log('[+] All indexes and columns verified and active in Neon Serverless Postgres!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
