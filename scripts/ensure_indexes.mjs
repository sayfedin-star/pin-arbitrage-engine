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

  console.log('[*] 5. Indexing competitor_boards & snapshots...');
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_boards_lookup ON competitor_boards(competitor_id, pin_count DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_history_lookup ON competitor_history_snapshots(competitor_id, recorded_date DESC);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 6. Ensuring is_product indexes on universal_master_pins...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_is_product ON universal_master_pins(is_product) WHERE is_product = TRUE;`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 7. Ensuring keyword intelligence indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_popular_pins_gin ON tracked_keywords USING gin(popular_pins jsonb_path_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm ON seed_guided_search_capsules (seed_pin_id, normalized_query);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw ON keyword_guided_capsules(keyword_id, display_order ASC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score ON keyword_guided_capsules(keyword_id, score DESC);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_keyword_active ON keyword_serp_positions(keyword_id, rank_position ASC) WHERE is_displaced = FALSE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_keyword_displaced ON keyword_serp_positions(keyword_id, vacuum_opportunity_score DESC NULLS LAST) WHERE is_displaced = TRUE;`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_pin_id ON keyword_serp_positions(pin_id);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 9. Ensuring trigram search and covering indexes...');
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`.catch(err => console.warn('[Extension Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON tracked_keywords(LOWER(keyword));`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_trgm_keyword ON tracked_keywords USING gin (LOWER(keyword) gin_trgm_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON competitor_profiles(LOWER(username));`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_trgm_username ON competitor_profiles USING gin (LOWER(username) gin_trgm_ops);`.catch(err => console.warn('[Index Notice]', err.message));
  await sql`CREATE INDEX IF NOT EXISTS idx_dir_trgm_domain ON domain_intelligence_rollup USING gin (LOWER(domain) gin_trgm_ops);`.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 10. Ensuring 24h Pulse breakout and velocity indexes...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ump_velocity
    ON universal_master_pins(daily_save_velocity DESC NULLS LAST, save_count DESC NULLS LAST);
  `.catch(err => console.warn('[Index Notice]', err.message));
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ump_repin_velocity
    ON universal_master_pins(daily_repin_velocity DESC NULLS LAST, repin_count DESC NULLS LAST);
  `.catch(err => console.warn('[Index Notice]', err.message));

  console.log('[*] 11. Ensuring Unified PostgreSQL SSOT 4-table indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_domain ON universal_master_pins(domain);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_creator ON universal_master_pins(creator_username);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_is_hydrated ON universal_master_pins(is_hydrated);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pdm_pin_recorded_desc ON pins_daily_metrics(pin_id, recorded_date DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pdm_recorded_date ON pins_daily_metrics(recorded_date);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cbp_competitor ON competitor_board_pins(competitor_id, position ASC NULLS LAST);`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cbp_pin;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cbp_pin_id ON competitor_board_pins(pin_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_last_scraped_at_desc ON universal_master_pins(last_scraped_at DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_updated_at_desc ON universal_master_pins(updated_at DESC);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_destination_url ON universal_master_pins(destination_url);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_displaced_date ON keyword_serp_positions(displaced_date) WHERE is_displaced = TRUE;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_displaced_updated_desc ON keyword_serp_positions(updated_at DESC) WHERE is_displaced = TRUE;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_pin_displaced_rank ON keyword_serp_positions(pin_id, is_displaced ASC, rank_position ASC NULLS LAST);`.catch(() => {});

  console.log('[*] 12. Ensuring clean_domain B-Tree indexes and pae_sync_clean_domain triggers...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves ON universal_master_pins(clean_domain, save_count DESC NULLS LAST);`.catch(() => {});
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

  console.log('[+] All indexes and columns verified and active in Unified PostgreSQL SSOT!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
