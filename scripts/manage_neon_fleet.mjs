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
