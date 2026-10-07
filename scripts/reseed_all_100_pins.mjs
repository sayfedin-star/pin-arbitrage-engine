#!/usr/bin/env node

/**
 * Reseed and Crawl All Keywords to 100 Pins
 * 1. Sets target_pin_count = 100 across Central Hub and all fleet shards.
 * 2. Crawls any active tracked keywords currently below 90 pins to reach 100 pins.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function run() {
  console.log('================================================================');
  console.log('🚀 100-PIN TARGET FLEET SYNCHRONIZER & CRAWLER');
  console.log('================================================================');

  // 1. Update Hub target_pin_count
  console.log('[*] Updating Central Hub target_pin_count = 100...');
  await hubSql`UPDATE tracked_keywords SET target_pin_count = 100;`;

  // 2. Discover Fleet Shards & update target_pin_count
  try {
    const shards = await hubSql`
      SELECT id, project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL;
    `;
    console.log(`[*] Updating target_pin_count = 100 across ${shards.length} fleet shards...`);
    const CHUNK_SIZE = 15;
    for (let i = 0; i < shards.length; i += CHUNK_SIZE) {
      const chunk = shards.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(chunk.map(async (shard) => {
        const sSql = neon(shard.database_url);
        await sSql`UPDATE tracked_keywords SET target_pin_count = 100;`;
      }));
    }
    console.log('[+] All fleet shards updated to 100 pins target.');
  } catch (err) {
    console.warn('[!] Fleet registry update warning:', err.message);
  }

  // 3. Find Hub keywords that need 100 pins crawl
  const keywords = await hubSql`
    SELECT tk.id, tk.keyword, tk.target_pin_count,
      (
        SELECT COUNT(DISTINCT pin_id)::int 
        FROM keyword_pins_snapshots 
        WHERE keyword_id = tk.id AND snapshot_date = CURRENT_DATE
      ) as today_pins
    FROM tracked_keywords tk
    WHERE tk.is_active = TRUE
    ORDER BY tk.id ASC;
  `;

  console.log(`[*] Checked ${keywords.length} active keywords on Central Hub:`);
  for (const kw of keywords) {
    console.log(`  - "${kw.keyword}": Today pins = ${kw.today_pins} / 100`);
    if (kw.today_pins < 90) {
      console.log(`    -> Crawling full 100 pins for "${kw.keyword}"...`);
      try {
        const crawlRes = await crawlKeywordSERP(hubSql, kw.id);
        console.log(`    [+] Crawled: ${crawlRes.crawled_pins} pins (Status: ${crawlRes.success})`);
      } catch (err) {
        console.error(`    [-] Error crawling "${kw.keyword}":`, err.message);
      }
      // Brief jitter delay
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('================================================================');
  console.log('🏁 100-PIN SYNCHRONIZATION COMPLETE!');
  console.log('================================================================');
}

run().catch(console.error);
