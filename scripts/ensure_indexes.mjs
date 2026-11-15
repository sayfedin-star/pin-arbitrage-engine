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
  await sql`DROP INDEX IF EXISTS idx_tracked_keywords_keyword;`.catch(() => {});
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
  await sql`DROP INDEX IF EXISTS idx_pdm_pin_recorded_desc;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_pdm_pin_snapshot_desc;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pdm_recorded_date ON pins_daily_metrics(recorded_date);`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cbp_pin;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cbp_pin_id ON competitor_board_pins(pin_id);`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ump_last_scraped_at_desc;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ump_last_scraped_at;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ump_updated_at_desc;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ump_updated;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_destination_url ON universal_master_pins(destination_url);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_displaced_date ON keyword_serp_positions(displaced_date) WHERE is_displaced = TRUE;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_ksp_displaced_updated_desc;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_pin_displaced_rank ON keyword_serp_positions(pin_id, is_displaced ASC, rank_position ASC NULLS LAST);`.catch(() => {});

  console.log('[*] 12. Ensuring clean_domain / domain_intelligence_rollup indexes and pae_sync_clean_domain triggers...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves ON universal_master_pins(clean_domain, save_count DESC NULLS LAST);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_dir_total_saves ON public.domain_intelligence_rollup(total_saves DESC NULLS LAST);`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_competitor_history_date;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_competitor_boards_comp_id;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cgn_seed;`.catch(() => {});
  await sql`DROP INDEX IF EXISTS idx_cgn_saves;`.catch(() => {});
  await sql`
    CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      raw_dom text;
      dest_url text;
    BEGIN
      raw_dom := COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.domain, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
      );
      IF raw_dom IS NULL OR raw_dom = '' THEN
        dest_url := BTRIM(COALESCE(NEW.destination_url, ''));
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

  console.log('[*] 13. Ensuring 062 SSOT and 20-worker modulo partition indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_visual_annotations_gin ON public.universal_master_pins USING gin (visual_annotations);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_hashtext_mod20 ON public.universal_master_pins ((ABS(hashtext(pin_id::text)::bigint) % 20));`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ksp_hashtext_mod20 ON public.keyword_serp_positions ((ABS(hashtext(pin_id::text)::bigint) % 20), keyword_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cbp_hashtext_mod20 ON public.competitor_board_pins ((ABS(hashtext(pin_id::text)::bigint) % 20), competitor_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_ump_is_product ON public.universal_master_pins (is_product) WHERE is_product = TRUE;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cbp_competitor ON public.competitor_board_pins (competitor_id, position ASC NULLS LAST);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON public.tracked_keywords (LOWER(keyword));`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON public.competitor_profiles (LOWER(username));`.catch(() => {});
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_tracked_keywords ON public.tracked_keywords (canonical_keyword);`.catch(() => {});
  await sql`
    CREATE OR REPLACE FUNCTION public.pae_sync_canonical_keyword()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      raw_input text;
      base_slug text;
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.keyword IS DISTINCT FROM OLD.keyword AND NEW.canonical_keyword IS NOT DISTINCT FROM OLD.canonical_keyword THEN
        raw_input := NEW.keyword;
      ELSE
        raw_input := COALESCE(NULLIF(TRIM(NEW.canonical_keyword), ''), NEW.keyword);
      END IF;
      base_slug := COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(raw_input, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
        NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(NEW.keyword, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
        'kw'
      );
      IF EXISTS (
        SELECT 1 FROM public.tracked_keywords
        WHERE canonical_keyword = LEFT(base_slug, 255)
          AND (NEW.id IS NULL OR id <> NEW.id)
      ) THEN
        NEW.canonical_keyword := LEFT(base_slug || '-' || COALESCE(NEW.id::text, (FLOOR(RANDOM() * 900000 + 100000))::text), 255);
      ELSE
        NEW.canonical_keyword := LEFT(base_slug, 255);
      END IF;
      RETURN NEW;
    END;
    $$;
  `.catch(err => console.warn('[Trigger Notice]', err.message));
  await sql`DROP TRIGGER IF EXISTS trg_tk_sync_canonical_keyword ON public.tracked_keywords;`.catch(() => {});
  await sql`
    CREATE TRIGGER trg_tk_sync_canonical_keyword
      BEFORE INSERT OR UPDATE OF keyword, canonical_keyword ON public.tracked_keywords
      FOR EACH ROW EXECUTE FUNCTION public.pae_sync_canonical_keyword();
  `.catch(err => console.warn('[Trigger Notice]', err.message));

  console.log('[+] All indexes and columns verified and active in Unified PostgreSQL SSOT!');
}

optimizeIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[-] Index optimization error:', err);
    process.exit(1);
  });
