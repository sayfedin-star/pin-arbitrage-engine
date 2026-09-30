#!/usr/bin/env node

/**
 * Neon Multi-Project Fleet Manager & Migration Runner
 * Manages up to 100 Neon Serverless Postgres projects, stores pooled connection strings,
 * runs idempotent migrations, and tracks cross-project statistics.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/**
 * Apply all migration files located in scripts/migrations
 */
export async function runMigrations() {
  console.log('[*] Applying core migrations to Neon Database...');

  // Migration 001: Fleet Registry
  console.log('[*] 1/3 Applying neon_projects_registry...');
  await sql`
    CREATE TABLE IF NOT EXISTS neon_projects_registry (
      id SERIAL PRIMARY KEY,
      project_id VARCHAR(64) UNIQUE NOT NULL,
      project_name VARCHAR(128) NOT NULL,
      region_id VARCHAR(64) DEFAULT 'aws-us-east-2',
      database_url TEXT NOT NULL,
      status VARCHAR(32) DEFAULT 'active',
      is_hub BOOLEAN DEFAULT FALSE,
      assigned_shards INT[] DEFAULT '{}',
      stats JSONB DEFAULT '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 0}'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_neon_projects_status ON neon_projects_registry(status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_neon_projects_is_hub ON neon_projects_registry(is_hub);`;
  console.log('[+] Migration 001 applied.');

  // Migration 002: Competitor Intelligence
  console.log('[*] 2/3 Applying Competitor Intelligence tables...');
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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
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
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type ON competitor_profiles(account_type);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_profiles_reach ON competitor_profiles(monthly_reach DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_id ON competitor_pins(competitor_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_pin_id ON competitor_pins(pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_history_date ON competitor_history_snapshots(competitor_id, recorded_date DESC);`;
  console.log('[+] Migration 002 applied.');

  // Migration 003: Keyword Velocity & SERP Tracker
  console.log('[*] 3/3 Applying Keyword Velocity tables...');
  await sql`
    CREATE TABLE IF NOT EXISTS tracked_keywords (
      id SERIAL PRIMARY KEY,
      keyword VARCHAR(255) UNIQUE NOT NULL,
      category VARCHAR(100) DEFAULT 'General',
      target_pin_count INT DEFAULT 50,
      refresh_interval_hours INT DEFAULT 24,
      last_crawled_at TIMESTAMP WITH TIME ZONE,
      top_pin_id VARCHAR(64),
      top_pin_title TEXT,
      top_pin_image TEXT,
      avg_daily_velocity NUMERIC(10, 2) DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(keyword_id, pin_id, snapshot_date)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_lookup ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_keyword_pins_velocity ON keyword_pins_snapshots(daily_save_velocity DESC);`;
  console.log('[+] Migration 003 applied.');

  // Migration 004: Competitor Boards Breakdown & Lateral Snapshots
  console.log('[*] 4/5 Applying Competitor Boards tables and lateral RPCs...');
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
  await sql`
    CREATE OR REPLACE FUNCTION get_competitor_board_counts()
    RETURNS TABLE (competitor_id INT, board_count BIGINT)
    LANGUAGE sql STABLE AS $$
      SELECT competitor_id, count(*)::BIGINT FROM competitor_boards GROUP BY competitor_id;
    $$;
  `;
  await sql`
    CREATE OR REPLACE FUNCTION get_latest_competitor_snapshots(p_competitor_ids INT[])
    RETURNS TABLE (
      competitor_id INT,
      monthly_reach BIGINT,
      profile_views BIGINT,
      follower_count INT,
      total_pins INT,
      total_boards INT,
      recorded_date DATE
    )
    LANGUAGE sql STABLE AS $$
      SELECT s.competitor_id, s.monthly_reach, s.profile_views, s.follower_count, s.total_pins, s.total_boards, s.recorded_date
      FROM unnest(p_competitor_ids) AS cid
      CROSS JOIN LATERAL (
        SELECT chs.competitor_id, chs.monthly_reach, chs.profile_views, chs.follower_count, chs.total_pins, chs.total_boards, chs.recorded_date
        FROM competitor_history_snapshots chs
        WHERE chs.competitor_id = cid
        ORDER BY chs.recorded_date DESC
        LIMIT 2
      ) s;
    $$;
  `;
  console.log('[+] Migration 004 applied.');

  // Migration 005: PinArchive Engine, Monotonic Metrics & Topic Clustering
  console.log('[*] 5/5 Applying PinArchive tables, monotonic triggers & topic clustering...');
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
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_annotations_gin ON pa_pins USING gin(annotations);`;
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
  await sql`
    CREATE OR REPLACE FUNCTION trg_pa_pins_enforce_monotonic_metrics()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        NEW.saves := GREATEST(COALESCE(OLD.saves, 0), COALESCE(NEW.saves, 0));
        NEW.repins := GREATEST(COALESCE(OLD.repins, 0), COALESCE(NEW.repins, 0));
        NEW.comments := GREATEST(COALESCE(OLD.comments, 0), COALESCE(NEW.comments, 0));
        NEW.share_count := GREATEST(COALESCE(OLD.share_count, 0), COALESCE(NEW.share_count, 0));
      END IF;
      RETURN NEW;
    END;
    $$;
  `;
  await sql`DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;`;
  await sql`
    CREATE TRIGGER trg_pa_pins_monotonic_metrics
      BEFORE UPDATE ON pa_pins
      FOR EACH ROW EXECUTE FUNCTION trg_pa_pins_enforce_monotonic_metrics();
  `;
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
        jsonb_array_elements(p.annotations) AS ann
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
  console.log('[+] Migration 005 applied.');
}

/**
 * Register the default Hub project into neon_projects_registry if not already present
 */
export async function registerDefaultHub(hubUrl = DATABASE_URL) {
  // Extract project host/id from the connection string if possible
  const hostMatch = hubUrl.match(/@([^.]+)/);
  const endpointId = hostMatch ? hostMatch[1] : 'default-hub';
  const projectId = 'weathered-band-34334459'; // Known Neon project ID
  const projectName = 'pin-arbitrage-engine (Hub)';

  console.log(`[*] Ensuring Hub project [${projectId}] is registered in neon_projects_registry...`);
  
  await sql`
    INSERT INTO neon_projects_registry (
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      stats,
      updated_at
    ) VALUES (
      ${projectId},
      ${projectName},
      'aws-us-east-2',
      ${hubUrl},
      'active',
      TRUE,
      '{"seeds": 0, "candidates": 0, "storage_mb": 38}'::jsonb,
      NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      database_url = EXCLUDED.database_url,
      is_hub = TRUE,
      status = 'active',
      updated_at = NOW();
  `;

  console.log(`[+] Hub project verified in registry.`);
}

/**
 * List all projects registered in the fleet
 */
export async function listFleetProjects() {
  const projects = await sql`
    SELECT 
      id,
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      assigned_shards,
      stats,
      created_at,
      updated_at
    FROM neon_projects_registry
    ORDER BY is_hub DESC, id ASC;
  `;
  return projects;
}

// Direct CLI execution
if (process.argv[1] === __filename) {
  console.log('=== Neon Serverless Fleet Manager ===');
  try {
    await runMigrations();
    await registerDefaultHub();
    const fleet = await listFleetProjects();
    console.log(`\n[+] Fleet Registry Status: ${fleet.length} project(s) registered:`);
    for (const p of fleet) {
      const maskedUrl = p.database_url.replace(/:([^:@]+)@/, ':••••••••@');
      console.log(`  - [${p.is_hub ? 'HUB' : 'SHARD'}] ${p.project_name} (${p.project_id})`);
      console.log(`    URL: ${maskedUrl}`);
      console.log(`    Status: ${p.status} | Region: ${p.region_id}`);
    }
    console.log('\n[+] Fleet setup and migrations completed successfully!');
  } catch (err) {
    console.error('[-] Fleet manager error:', err);
    process.exit(1);
  }
}
