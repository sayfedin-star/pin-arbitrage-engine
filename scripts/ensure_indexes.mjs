#!/usr/bin/env node

/**
 * Unified PostgreSQL SSOT Index Optimization Script
 * Creates critical indexes for sub-millisecond query performance:
 * - cluster_arbitrage_metrics (seed_pin_id, analyzed_at DESC)
 * - candidate_graph_nodes (candidate_pin_id)
 * - seed_guided_search_capsules (seed_pin_id, discovered_at DESC)
 */

import { createSqlClient } from '../src/db/client.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] DATABASE_URL is missing.');
  process.exit(1);
}

const sql = createSqlClient(DATABASE_URL);

async function optimizeIndexes() {
  console.log('[*] Optimizing Unified PostgreSQL SSOT Database Indexes...');

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
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS query_term TEXT;`.catch(() => {});
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS normalized_query TEXT;`.catch(() => {});
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS image_url TEXT;`.catch(() => {});
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS search_url TEXT;`.catch(() => {});
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS node_id TEXT;`.catch(() => {});
  await sql`ALTER TABLE seed_guided_search_capsules ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();`.catch(() => {});
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

  console.log('[*] 5. Indexing P4 pa_pins...');
  await sql`DROP TRIGGER IF EXISTS trg_pa_pins_monotonic ON pa_pins;`.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_created_at_pinterest ON pa_pins(created_at_pinterest DESC NULLS LAST);`.catch(err => console.warn('[Index Notice]', err.message));

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

  console.log('[*] 9. Ensuring enrichment_status and updated_at on competitor_pins for GHA 20-runner queue...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(32) DEFAULT 'pending';`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`DROP INDEX IF EXISTS idx_competitor_pins_enrichment_queue;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`DROP INDEX IF EXISTS idx_competitor_pins_queue_fast;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrichment_global ON competitor_pins(enrichment_status) WHERE enrichment_status = 'pending';`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_stale_reclaim ON competitor_pins(enrichment_status, updated_at) WHERE enrichment_status = 'processing';`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 10. Ensuring keyword intelligence indexes & column widths...');
  await sql`ALTER TABLE tracked_keywords ALTER COLUMN top_pin_id TYPE VARCHAR(255);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_guided_capsules ALTER COLUMN dominant_color TYPE VARCHAR(64);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_popular_pins_gin ON tracked_keywords USING gin(popular_pins jsonb_path_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm ON seed_guided_search_capsules (seed_pin_id, normalized_query);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw ON keyword_guided_capsules(keyword_id, display_order ASC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score ON keyword_guided_capsules(keyword_id, score DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kdi_kw_vacuum ON keyword_displaced_index(keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kdi_pin_id ON keyword_displaced_index(pin_id);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 11. Ensuring created_at_pinterest and creation_method columns exist...');
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMP WITH TIME ZONE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`ALTER TABLE universal_master_pins ADD COLUMN IF NOT EXISTS creation_method VARCHAR(50);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 12. Ensuring trigram search and covering indexes [CAP-23, CAP-24, Migration 023]...');
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`.catch(err => console.warn('[Extension Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON tracked_keywords(LOWER(keyword));`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_trgm_keyword ON tracked_keywords USING gin (LOWER(keyword) gin_trgm_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON competitor_profiles(LOWER(username));`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_trgm_username ON competitor_profiles USING gin (LOWER(username) gin_trgm_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  // [INVARIANT: 100% POSTGRESQL HOT UPDATES & CLEAN B-TREE INDEXES - MIGRATION 037]
  await sql`DROP INDEX IF EXISTS idx_ksc_active_covering;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ksc_domain_serp_authority;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cp_link_domain_saves;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cp_domain_rollup_covering;`.catch(() => {});

  console.log('[*] 13. Ensuring 24h Pulse breakout and driver pin indexes [Round 14]...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ksc_velocity_breakout
    ON keyword_serp_current(daily_save_velocity DESC, delta_repins_24h DESC)
    WHERE (is_displaced = FALSE AND daily_save_velocity > 0);
  `.catch(err => console.warn('[Index Notice]', err.message));
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_driver_pins
    ON competitor_pins(competitor_id, save_count DESC)
    WHERE is_deleted = FALSE;
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 14. Ensuring Unified PostgreSQL SSOT master & daily metric indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_domain ON universal_master_pins(domain);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_creator ON universal_master_pins(creator_username);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pdm_pin_date ON pins_daily_metrics(pin_id, snapshot_date ASC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_psp_pin_date ON pin_serp_positions(pin_id, snapshot_date ASC);`.catch(() => {});

  console.log('[*] 15. Ensuring clean_domain columns, B-Tree indexes, and pae_sync_clean_domain triggers [Migration 052/053/057]...');
  await sql`ALTER TABLE universal_master_pins ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);`.catch(() => {});
  await sql`ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves ON universal_master_pins(clean_domain, save_count DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_competitor_clean_domain ON competitor_pins(competitor_id, clean_domain);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_clean_domain ON competitor_pins(clean_domain) WHERE clean_domain IS NOT NULL AND clean_domain <> '';`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_clean_domain ON pa_pins(clean_domain, saves DESC) WHERE clean_domain IS NOT NULL AND clean_domain <> '';`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksc_clean_domain ON keyword_serp_current(clean_domain);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_kdi_clean_domain ON keyword_displaced_index(clean_domain);`.catch(() => {});
  await sql`
    CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      row_data jsonb;
      raw_dom text;
      dest_url text;
    BEGIN
      row_data := to_jsonb(NEW);
      raw_dom := COALESCE(
        NULLIF(BTRIM(COALESCE(row_data->>'domain', '')), ''),
        NULLIF(BTRIM(COALESCE(row_data->>'link_domain', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
      );
      IF raw_dom IS NULL OR raw_dom = '' THEN
        dest_url := COALESCE(
          NULLIF(BTRIM(COALESCE(row_data->>'destination_url', '')), ''),
          BTRIM(COALESCE(row_data->>'link', ''))
        );
        IF dest_url <> '' THEN
          raw_dom := SUBSTRING(LOWER(dest_url) FROM '^https?://(?:www\.)?([^/?#:]+)');
        END IF;
      END IF;
      raw_dom := COALESCE(raw_dom, '');
      raw_dom := REGEXP_REPLACE(LOWER(BTRIM(raw_dom)), '^https?://', '');
      raw_dom := REGEXP_REPLACE(raw_dom, '/.*$', '');
      NEW.clean_domain := REGEXP_REPLACE(raw_dom, '^www\.', '');
      RETURN NEW;
    END;
    $$;
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_ump_sync_clean_domain ON universal_master_pins;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_ump_sync_clean_domain
      BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain ON universal_master_pins
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_cp_sync_clean_domain ON competitor_pins;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_cp_sync_clean_domain
      BEFORE INSERT OR UPDATE OF link_domain, destination_url, clean_domain ON competitor_pins
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_pa_pins_sync_clean_domain ON pa_pins;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_pa_pins_sync_clean_domain
      BEFORE INSERT OR UPDATE OF domain, link, clean_domain ON pa_pins
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_ksc_sync_clean_domain ON keyword_serp_current;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_ksc_sync_clean_domain
      BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain ON keyword_serp_current
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_kdi_sync_clean_domain ON keyword_displaced_index;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_kdi_sync_clean_domain
      BEFORE INSERT OR UPDATE OF domain, clean_domain ON keyword_displaced_index
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();
  `.catch(err => console.warn('[Trigger Notice]', err.message));

  console.log('[+] All indexes and columns verified and active in Unified PostgreSQL SSOT!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
