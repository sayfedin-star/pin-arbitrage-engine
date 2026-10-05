#!/usr/bin/env node

/**
 * Migration: Create Competitor Related Pins & Seed Tables
 * Establishes isolated tables for Account-Scoped Related Pins & Multi-Seed Intersections Radar.
 * Strictly adheres to Workspace Directive Rule 4 (Non-Destructive Architectural Integrity).
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Load environment variables safely
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
  if (match) dbUrl = match[1].trim();
}

if (!dbUrl) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(dbUrl);

async function runMigration() {
  console.log('[*] Running Migration: competitor_seed_pins & competitor_related_nodes...');

  // 1. Create competitor_seed_pins
  console.log('[*] 1. Creating competitor_seed_pins table...');
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_seed_pins (
      id BIGSERIAL PRIMARY KEY,
      competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
      pin_id VARCHAR(64) NOT NULL,
      title TEXT,
      image_url TEXT,
      board_name VARCHAR(255),
      save_count BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_crawled_at TIMESTAMPTZ,
      UNIQUE (competitor_id, pin_id)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_csp_comp_pin ON competitor_seed_pins(competitor_id, pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_csp_comp_id ON competitor_seed_pins(competitor_id);`;
  console.log('[+] competitor_seed_pins table & indexes verified.');

  // 2. Create competitor_related_nodes
  console.log('[*] 2. Creating competitor_related_nodes table...');
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_related_nodes (
      id BIGSERIAL PRIMARY KEY,
      competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
      seed_pin_id VARCHAR(64) NOT NULL,
      candidate_pin_id VARCHAR(64) NOT NULL,
      title TEXT,
      image_url TEXT,
      dominant_color VARCHAR(32),
      saves INT DEFAULT 0,
      repins INT DEFAULT 0,
      domain TEXT,
      destination_url TEXT,
      is_product BOOLEAN DEFAULT FALSE,
      is_same_account BOOLEAN DEFAULT FALSE,
      creator_username VARCHAR(100),
      creator_name VARCHAR(255),
      provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
      discovered_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (competitor_id, seed_pin_id, candidate_pin_id)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_crn_comp_candidate ON competitor_related_nodes(competitor_id, candidate_pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crn_comp_seed ON competitor_related_nodes(competitor_id, seed_pin_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crn_comp_retention ON competitor_related_nodes(competitor_id, is_same_account);`;
  console.log('[+] competitor_related_nodes table & indexes verified.');

  console.log('[+] Migration complete! All Account Related Pins tables are active on Neon Postgres.');
}

runMigration().catch((err) => {
  console.error('[-] Migration failed:', err);
  process.exit(1);
});
