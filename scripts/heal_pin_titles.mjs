#!/usr/bin/env node

/**
 * Historical Data Healing Script for keyword_pins_snapshots
 * Scans Central Hub and all active fleet shards for pins with empty or "Untitled Pin" titles,
 * and updates them with clean, derived titles extracted from destination URLs, slugs,
 * board names, or visual annotations.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePinTitle } from '../src/modules/keywords/folders-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
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
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function healDatabase(sql, dbName) {
  try {
    const rows = await sql`
      SELECT s.id, s.pin_id, s.title, s.destination_url, s.metadata, tk.keyword
      FROM keyword_pins_snapshots s
      LEFT JOIN tracked_keywords tk ON tk.id = s.keyword_id
      WHERE s.title IS NULL 
         OR s.title = '' 
         OR s.title ILIKE 'untitled%'
         OR s.title ILIKE 'pin #%'
      LIMIT 1000;
    `;

    if (rows.length === 0) {
      return { ok: true, name: dbName, healed: 0 };
    }

    let healedCount = 0;
    for (const r of rows) {
      const meta = typeof r.metadata === 'object' && r.metadata !== null ? r.metadata : {};
      const newTitle = derivePinTitle(
        r.title,
        r.destination_url || meta.destination_url,
        r.keyword,
        meta.board_name,
        Array.isArray(meta.visual_annotations) ? meta.visual_annotations : []
      );

      if (newTitle && newTitle !== r.title && !newTitle.toLowerCase().startsWith('untitled')) {
        await sql`
          UPDATE keyword_pins_snapshots
          SET title = ${newTitle}
          WHERE id = ${r.id};
        `;
        healedCount++;
      }
    }

    return { ok: true, name: dbName, healed: healedCount };
  } catch (err) {
    return { ok: false, name: dbName, error: err.message };
  }
}

async function run() {
  console.log('================================================================');
  console.log('🩺 NEON FLEET PIN TITLE HEALER (Central Hub + All Shards)');
  console.log('================================================================');

  // 1. Central Hub
  console.log('[*] Healing Central Hub database...');
  const hubResult = await healDatabase(hubSql, 'Central Hub');
  if (hubResult.ok) {
    console.log(`[+] Central Hub complete: Healed ${hubResult.healed} untitled pins.`);
  } else {
    console.error(`[-] Central Hub failed: ${hubResult.error}`);
  }

  // 2. Discover Fleet Shards from neon_projects_registry
  let shards = [];
  try {
    shards = await hubSql`
      SELECT id, project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
    console.log(`[*] Discovered ${shards.length} registered active fleet shards.`);
  } catch (err) {
    console.log(`[!] No fleet registry found or query skipped: ${err.message}`);
  }

  let totalFleetHealed = hubResult.healed || 0;
  let successCount = hubResult.ok ? 1 : 0;
  let failCount = hubResult.ok ? 0 : 1;

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    const name = shard.project_name || shard.project_id || `Shard #${i+1}`;
    process.stdout.write(`[${i+1}/${shards.length}] Healing ${name}... `);
    const sSql = neon(shard.database_url);
    const res = await healDatabase(sSql, name);
    if (res.ok) {
      totalFleetHealed += res.healed;
      successCount++;
      console.log(`OK (${res.healed} healed)`);
    } else {
      failCount++;
      console.log(`FAILED: ${res.error}`);
    }
  }

  console.log('================================================================');
  console.log(`🏁 FINISHED: Healed ${totalFleetHealed} pins across ${successCount} databases (${failCount} failed).`);
  console.log('================================================================');
}

run().catch(console.error);
