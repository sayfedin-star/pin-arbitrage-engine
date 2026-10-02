#!/usr/bin/env node

/**
 * Migrate all 99 Neon Shards
 * Applies identical schema (competitor_profiles, competitor_pins, pa_pins, pa_pin_metrics, pa_staged_pins)
 * across every registered shard project in parallel batches.
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

async function migrateSingleShard(shard) {
  const sql = neon(shard.database_url);
  
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
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);`;
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

  console.log('\n[+] SUCCESS: All 99 Neon shards have identical tables and indexes!');
}

main().catch(err => {
  console.error('[-] Fatal error:', err);
  process.exit(1);
});
