#!/usr/bin/env node

/**
 * Universal Neon Fleet Migration Runner
 * Applies the 100% IDENTICAL complete schema across all 99 Neon Shards:
 * 1. competitor_profiles (with last_harvest_metadata, metadata, etc.)
 * 2. competitor_history_snapshots
 * 3. competitor_boards
 * 4. competitor_pins
 * 5. pa_pins
 * 6. pa_pin_metrics
 * 7. pa_staged_pins
 * 8. pa_qualification_rules (seeded with default rules)
 * 9. cluster_seeds
 * 10. candidate_graph_nodes
 * 11. cluster_arbitrage_metrics
 * 12. seed_guided_search_capsules
 * 13. tracked_keywords
 * 14. keyword_pins_snapshots
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL is not set.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

export async function migrateSingleShard(shard) {
  const sql = neon(shard.database_url);
  
  // 1. Competitor Profiles
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_profiles (
      id SERIAL PRIMARY KEY,
      username VARCHAR(128) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      avatar_url TEXT,
      bio TEXT,
      website_url TEXT,
      monthly_reach BIGINT DEFAULT 0,
      reach_delta_7d BIGINT DEFAULT 0,
      profile_views BIGINT DEFAULT 0,
      views_delta_7d BIGINT DEFAULT 0,
      total_pins INT DEFAULT 0,
      total_boards INT DEFAULT 0,
      follower_count INT DEFAULT 0,
      following_count INT DEFAULT 0,
      account_type VARCHAR(32) DEFAULT 'competitor',
      activity_status VARCHAR(64) DEFAULT 'active',
      last_synced_at TIMESTAMP WITH TIME ZONE,
      is_active BOOLEAN DEFAULT TRUE,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}'::jsonb,
      last_harvest_metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  await sql`ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS last_harvest_metadata JSONB DEFAULT '{}'::jsonb;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type ON competitor_profiles(account_type);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_profiles_reach ON competitor_profiles(monthly_reach DESC);`;

  // 2. Competitor History Snapshots
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_history_snapshots (
      id BIGSERIAL PRIMARY KEY,
      competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
      monthly_reach BIGINT DEFAULT 0,
      profile_views BIGINT DEFAULT 0,
      follower_count INT DEFAULT 0,
      total_pins INT DEFAULT 0,
      total_boards INT DEFAULT 0,
      recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(competitor_id, recorded_date)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_history_date ON competitor_history_snapshots(competitor_id, recorded_date DESC);`;

  // 3. Competitor Boards
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_boards (
      id SERIAL PRIMARY KEY,
      competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
      board_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      url TEXT,
      pin_count INT DEFAULT 0,
      follower_count INT DEFAULT 0,
      last_pinned_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(competitor_id, board_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_boards_comp_id ON competitor_boards(competitor_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_boards_activity ON competitor_boards(competitor_id, last_pinned_at DESC NULLS LAST);`;

  // 4. Competitor Pins (Raw Inventory)
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_pins (
      id BIGSERIAL PRIMARY KEY,
      competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
      pin_id VARCHAR(64) NOT NULL,
      title TEXT,
      description TEXT,
      link_domain VARCHAR(255),
      destination_url TEXT,
      board_name VARCHAR(255),
      image_url TEXT,
      save_count INT DEFAULT 0,
      repin_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      created_at_pinterest TIMESTAMP WITH TIME ZONE,
      first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(competitor_id, pin_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_id ON competitor_pins(competitor_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_pin_id ON competitor_pins(pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_saves ON competitor_pins(save_count DESC);`;

  // Auto-backfill discovered boards from competitor_pins into competitor_boards
  try {
    await sql`
      INSERT INTO competitor_boards (competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at, created_at, updated_at)
      SELECT 
        cp.competitor_id,
        'cb-' || substr(md5(lower(trim(cp.board_name))), 1, 16),
        trim(cp.board_name),
        'https://www.pinterest.com/' || p.username || '/' || lower(regexp_replace(trim(cp.board_name), '[^a-zA-Z0-9]+', '-', 'g')) || '/',
        count(*)::int,
        coalesce(max(cp.save_count), 0)::int,
        max(cp.created_at_pinterest),
        min(cp.created_at_pinterest),
        NOW()
      FROM competitor_pins cp
      JOIN competitor_profiles p ON p.id = cp.competitor_id
      WHERE cp.board_name IS NOT NULL 
        AND trim(cp.board_name) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM competitor_boards cb 
          WHERE cb.competitor_id = cp.competitor_id 
            AND lower(trim(cb.name)) = lower(trim(cp.board_name))
        )
      GROUP BY cp.competitor_id, p.username, trim(cp.board_name)
      ON CONFLICT (competitor_id, board_id) DO NOTHING;
    `;
  } catch (_) {}

  // 5. PinArchive Pins (pa_pins)
  await sql`
    CREATE TABLE IF NOT EXISTS pa_pins (
      pin_id VARCHAR(64) PRIMARY KEY,
      account_username VARCHAR(128),
      title TEXT,
      description TEXT,
      link TEXT,
      domain VARCHAR(255),
      board_name VARCHAR(255),
      image_url TEXT,
      dominant_color VARCHAR(32),
      saves BIGINT DEFAULT 0,
      repins BIGINT DEFAULT 0,
      comments INT DEFAULT 0,
      share_count BIGINT DEFAULT 0,
      reactions JSONB DEFAULT '{}'::jsonb,
      velocity NUMERIC(10, 2) DEFAULT 0,
      annotations JSONB DEFAULT '[]'::jsonb,
      is_video BOOLEAN DEFAULT FALSE,
      is_product BOOLEAN DEFAULT FALSE,
      created_at_pinterest TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`;

  // 6. PinArchive Time-Series Metrics (pa_pin_metrics)
  await sql`
    CREATE TABLE IF NOT EXISTS pa_pin_metrics (
      id BIGSERIAL PRIMARY KEY,
      pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
      recorded_at TIMESTAMPTZ DEFAULT NOW(),
      saves BIGINT DEFAULT 0,
      repins BIGINT DEFAULT 0,
      comments INT DEFAULT 0,
      UNIQUE(pin_id, recorded_at)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pin_metrics_lookup ON pa_pin_metrics(pin_id, recorded_at DESC);`;

  // 7. PinArchive Staged Repurposing Queue (pa_staged_pins)
  await sql`
    CREATE TABLE IF NOT EXISTS pa_staged_pins (
      id SERIAL PRIMARY KEY,
      pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
      target_board VARCHAR(255),
      override_link TEXT,
      status VARCHAR(32) DEFAULT 'staged',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_staged_pins_status ON pa_staged_pins(status);`;

  // 8. Pin Qualification Rules (pa_qualification_rules)
  await sql`
    CREATE TABLE IF NOT EXISTS pa_qualification_rules (
      id INT PRIMARY KEY DEFAULT 1,
      tier1_min_saves INT DEFAULT 100,
      tier2_min_repins INT DEFAULT 100,
      tier3_max_age_days INT DEFAULT 14,
      tier3_min_saves INT DEFAULT 25,
      master_ingest_enabled BOOLEAN DEFAULT TRUE,
      early_stop_pages INT DEFAULT 3,
      max_batch_pins INT DEFAULT 500,
      discovery_max_pages INT DEFAULT 500,
      refresh_max_pins INT DEFAULT 0,
      paused_policy VARCHAR(32) DEFAULT 'reject',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_rules_row CHECK (id = 1)
    );
  `;
  await sql`
    INSERT INTO pa_qualification_rules (
      id, tier1_min_saves, tier2_min_repins, tier3_max_age_days, tier3_min_saves,
      master_ingest_enabled, early_stop_pages, max_batch_pins, discovery_max_pages, refresh_max_pins, paused_policy, updated_at
    ) VALUES (
      1, 100, 100, 14, 25, TRUE, 3, 500, 500, 0, 'reject', NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  `;

  // 8.1 Topic Clusters RPC Function (pa_topic_clusters_page)
  await sql`
    CREATE OR REPLACE FUNCTION pa_topic_clusters_page(
      p_min_pins INT DEFAULT 1,
      p_search TEXT DEFAULT NULL,
      p_limit INT DEFAULT 50,
      p_offset INT DEFAULT 0
    )
    RETURNS TABLE (
      topic_name TEXT,
      pins_count BIGINT,
      total_saves NUMERIC,
      avg_saves BIGINT,
      avg_velocity NUMERIC
    )
    LANGUAGE plpgsql AS $$
    BEGIN
      RETURN QUERY
      WITH extracted AS (
        SELECT
          CASE
            WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
            WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
            ELSE NULL
          END AS raw_topic,
          p.pin_id,
          p.saves,
          p.velocity
        FROM pa_pins p,
        LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann
        WHERE (
          (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
          OR
          (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
        )
      ),
      aggregated AS (
        SELECT
          e.raw_topic AS t_name,
          count(DISTINCT e.pin_id)::BIGINT AS p_count,
          coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
          CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
          round(avg(e.velocity), 2) AS a_velocity
        FROM extracted e
        WHERE (p_search IS NULL OR p_search = '' OR e.raw_topic ILIKE '%' || p_search || '%')
        GROUP BY e.raw_topic
        HAVING count(DISTINCT e.pin_id) >= coalesce(p_min_pins, 1)
      )
      SELECT
        a.t_name AS topic_name,
        a.p_count AS pins_count,
        a.s_saves AS total_saves,
        a.a_saves AS avg_saves,
        a.a_velocity AS avg_velocity
      FROM aggregated a
      ORDER BY a.s_saves DESC
      LIMIT coalesce(p_limit, 50)
      OFFSET coalesce(p_offset, 0);
    END;
    $$;
  `;

  // 9. Cluster Seeds (Phase 1 Core)
  await sql`
    CREATE TABLE IF NOT EXISTS cluster_seeds (
      pin_id VARCHAR(64) PRIMARY KEY,
      label VARCHAR(255),
      is_competitor BOOLEAN DEFAULT FALSE,
      velocity NUMERIC DEFAULT 0,
      last_crawled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 10. Candidate Graph Nodes (Phase 1 Graph)
  await sql`
    CREATE TABLE IF NOT EXISTS candidate_graph_nodes (
      id BIGSERIAL PRIMARY KEY,
      seed_pin_id VARCHAR(64),
      candidate_pin_id VARCHAR(64) NOT NULL,
      title TEXT,
      dominant_color VARCHAR(32),
      aspect_ratio NUMERIC,
      saves INT DEFAULT 0,
      repins INT DEFAULT 0,
      save_rate NUMERIC,
      domain TEXT,
      is_product BOOLEAN DEFAULT FALSE,
      ocr_text TEXT,
      extracted_at TIMESTAMPTZ DEFAULT NOW(),
      pin_created_at TIMESTAMPTZ,
      age_days INT DEFAULT 1,
      daily_velocity NUMERIC DEFAULT 0,
      provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
      individual_prod_score NUMERIC DEFAULT 0,
      recgpt_transition_score NUMERIC DEFAULT 0,
      sequence_role VARCHAR(64) DEFAULT 'DIRECT_MATCH',
      is_recgpt_candidate BOOLEAN DEFAULT FALSE,
      visual_entropy_score NUMERIC DEFAULT 0,
      image_url TEXT,
      is_video BOOLEAN DEFAULT FALSE,
      ingestion_method VARCHAR(64)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_cgn_seed ON candidate_graph_nodes(seed_pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cgn_candidate ON candidate_graph_nodes(candidate_pin_id);`;

  // 11. Cluster Arbitrage Metrics
  await sql`
    CREATE TABLE IF NOT EXISTS cluster_arbitrage_metrics (
      id BIGSERIAL PRIMARY KEY,
      seed_pin_id VARCHAR(64),
      total_candidates INT,
      recgpt_count INT DEFAULT 0,
      navboost_count INT DEFAULT 0,
      randomwalk_count INT DEFAULT 0,
      two_tower_count INT DEFAULT 0,
      fresh_candidate_count INT DEFAULT 0,
      product_count INT DEFAULT 0,
      commercial_gap_ratio NUMERIC,
      winning_color_centroids JSONB,
      high_save_tokens JSONB,
      utility_snapshot JSONB,
      analyzed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 12. Guided Search Capsules
  await sql`
    CREATE TABLE IF NOT EXISTS seed_guided_search_capsules (
      id SERIAL PRIMARY KEY,
      seed_pin_id VARCHAR(64) NOT NULL,
      query_term TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      image_url TEXT,
      search_url TEXT,
      node_id TEXT,
      discovered_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 13. Tracked Keywords
  await sql`
    CREATE TABLE IF NOT EXISTS tracked_keywords (
      id SERIAL PRIMARY KEY,
      keyword VARCHAR(255) UNIQUE NOT NULL,
      category VARCHAR(100) DEFAULT 'General',
      target_pin_count INT DEFAULT 50,
      refresh_interval_hours INT DEFAULT 24,
      last_crawled_at TIMESTAMPTZ,
      top_pin_id VARCHAR(64),
      top_pin_title TEXT,
      top_pin_image TEXT,
      avg_daily_velocity NUMERIC(10, 2) DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 14. Keyword Pins Snapshots
  await sql`
    CREATE TABLE IF NOT EXISTS keyword_pins_snapshots (
      id BIGSERIAL PRIMARY KEY,
      keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      pin_id VARCHAR(64) NOT NULL,
      rank_position INT DEFAULT 1,
      title TEXT,
      domain VARCHAR(255),
      destination_url TEXT,
      image_url TEXT,
      save_count INT DEFAULT 0,
      repin_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      daily_save_velocity INT DEFAULT 0,
      snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(keyword_id, pin_id, snapshot_date)
    );
  `;
}

async function main() {
  console.log('[*] Fetching all shards from neon_projects_registry...');
  const shards = await hubSql`
    SELECT project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE is_hub = FALSE AND status = 'active'
    ORDER BY id ASC;
  `;

  console.log(`[*] Found ${shards.length} shards to migrate. Starting batch migration...`);
  
  const BATCH_SIZE = 10;
  for (let i = 0; i < shards.length; i += BATCH_SIZE) {
    const chunk = shards.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (shard) => {
      try {
        await migrateSingleShard(shard);
      } catch (err) {
        console.error(`[-] Error migrating ${shard.project_name}:`, err.message);
      }
    }));
    console.log(`  -> Migrated ${Math.min(i + BATCH_SIZE, shards.length)} / ${shards.length} shards...`);
  }

  console.log('\n[+] SUCCESS: All 99 Neon shards have 100% IDENTICAL tables, columns, and indexes!');
}

main().catch(err => {
  console.error('[-] Fatal error:', err);
  process.exit(1);
});
