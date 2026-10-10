#!/usr/bin/env node

/**
 * Populate Neon Fleet Registry with all 100 Neon Serverless Projects
 * Inserts 99 Shards + 1 Hub into neon_projects_registry
 * 
 * SECURITY COMPLIANT: Reads from NEON_SHARDS_JSON or NEON_SHARD_DSN_TEMPLATE.
 * Never stores plaintext credentials in git repository source control.
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

const sql = neon(DATABASE_URL);

// Dynamic Neon Fleet configuration loader
let shards = [];

if (process.env.NEON_SHARDS_JSON) {
  try {
    shards = JSON.parse(process.env.NEON_SHARDS_JSON);
  } catch (err) {
    console.error('[-] Failed to parse NEON_SHARDS_JSON:', err.message);
  }
} else if (process.env.NEON_SHARD_DSN_TEMPLATE) {
  const template = process.env.NEON_SHARD_DSN_TEMPLATE;
  shards = Array.from({ length: 99 }, (_, i) => {
    const shardNum = i + 1;
    const shardStr = String(shardNum).padStart(2, '0');
    return {
      shard: shardNum,
      id: `shard-${shardStr}`,
      url: template.replace(/\{SHARD_NUM\}/g, String(shardNum)).replace(/\{SHARD_STR\}/g, shardStr)
    };
  });
} else {
  console.log('[*] Notice: No NEON_SHARDS_JSON or NEON_SHARD_DSN_TEMPLATE provided in environment.');
  console.log('[*] Shard registry will maintain existing neon_projects_registry entries.');
}

async function main() {
  console.log(`[*] Connecting to Central Hub database...`);
  
  // 1. Ensure table exists
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

  // 2. Ensure Hub is registered
  const hubId = process.env.NEON_HUB_PROJECT_ID || 'hub-core';
  await sql`
    INSERT INTO neon_projects_registry (
      project_id, project_name, region_id, database_url, status, is_hub, stats, updated_at
    ) VALUES (
      ${hubId}, 'pin-arbitrage-engine (Hub)', 'aws-us-east-2', ${DATABASE_URL}, 'active', TRUE,
      '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 42}'::jsonb, NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      database_url = EXCLUDED.database_url,
      is_hub = TRUE,
      status = 'active',
      updated_at = NOW();
  `;
  console.log(`[+] Verified Hub project registration in registry: ${hubId}`);

  // 3. Register shards if dynamically supplied
  if (shards.length > 0) {
    console.log(`[*] Registering ${shards.length} shards in neon_projects_registry...`);
    let registered = 0;
    for (const s of shards) {
      const parsedNum = parseInt(String(s.shard ?? s.id ?? '').replace(/\D/g, ''), 10) || (registered + 1);
      const shardNum = parsedNum.toString().padStart(2, '0');
      const shardId = s.id || `shard-${shardNum}`;
      const name = s.project_name || `pin-arbitrage-shard-${shardNum}`;
      const dbUrl = s.url || s.database_url;
      if (!dbUrl) {
        console.warn(`[-] Skipping shard entry #${shardNum}: Missing connection URL.`);
        continue;
      }
      await sql`
        INSERT INTO neon_projects_registry (
          project_id, project_name, region_id, database_url, status, is_hub, assigned_shards, stats, updated_at
        ) VALUES (
          ${shardId}, ${name}, 'aws-us-east-2', ${dbUrl}, 'active', FALSE, ARRAY[${parsedNum}]::INT[],
          '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 0}'::jsonb, NOW()
        )
        ON CONFLICT (project_id) DO UPDATE SET
          project_name = EXCLUDED.project_name,
          database_url = EXCLUDED.database_url,
          assigned_shards = EXCLUDED.assigned_shards,
          status = 'active',
          updated_at = NOW();
      `;
      registered++;
      if (registered % 20 === 0 || registered === shards.length) {
        console.log(`  -> Registered ${registered}/${shards.length} shards...`);
      }
    }
  }

  // 4. Verify total count in DB
  const [countRow] = await sql`SELECT count(*)::INT as total, count(*) FILTER (WHERE is_hub) as hubs, count(*) FILTER (WHERE NOT is_hub) as shards FROM neon_projects_registry;`;
  console.log(`\n========================================`);
  console.log(`[+] SUCCESS: Fleet Registry status verified!`);
  console.log(`[+] Total Projects in Database: ${countRow.total}`);
  console.log(`[+] Hub Projects: ${countRow.hubs}`);
  console.log(`[+] Shard Projects: ${countRow.shards}`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[-] Error populating fleet:', err);
  process.exit(1);
});
