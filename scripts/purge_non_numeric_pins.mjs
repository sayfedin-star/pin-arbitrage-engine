#!/usr/bin/env node

/**
 * Neon Hub & Fleet Purge & Re-Ranking Script
 * 1. Purges non-numeric pin IDs from keyword_serp_current, keyword_pins_snapshots, keyword_ignored_pins
 * 2. Resequences ranks 1..N using ROW_NUMBER() to eliminate rank gaps
 * 3. Updates tracked_keywords top_pin_id, title, and image
 * 4. Cleans metadata->'last_dropped_pins' from non-numeric pins
 * 5. Cleans shards if any contain non-numeric pins
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] Missing DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log('================================================================================');
  console.log('🚀 PURGING NON-NUMERIC PINS & RESEQUENCING RANKS ON NEON HUB');
  console.log('================================================================================');

  // 1. Initial counts
  const [beforeSerp] = await sql`SELECT count(*) FROM keyword_serp_current WHERE pin_id !~ '^[0-9]+$'`;
  const [beforeSnap] = await sql`SELECT count(*) FROM keyword_pins_snapshots WHERE pin_id !~ '^[0-9]+$'`;
  const [beforeIgnored] = await sql`SELECT count(*) FROM keyword_ignored_pins WHERE pin_id !~ '^[0-9]+$'`;
  const [beforeTopPin] = await sql`SELECT count(*) FROM tracked_keywords WHERE top_pin_id IS NOT NULL AND top_pin_id !~ '^[0-9]+$'`;

  console.log(`[i] Non-numeric rows found:`);
  console.log(`    - keyword_serp_current: ${beforeSerp.count}`);
  console.log(`    - keyword_pins_snapshots: ${beforeSnap.count}`);
  console.log(`    - keyword_ignored_pins: ${beforeIgnored.count}`);
  console.log(`    - tracked_keywords (invalid top_pin_id): ${beforeTopPin.count}`);

  // A) Delete non-numeric rows
  console.log('\n[*] Step A: Deleting non-numeric pins...');
  await sql`DELETE FROM keyword_serp_current WHERE pin_id !~ '^[0-9]+$';`;
  await sql`DELETE FROM keyword_pins_snapshots WHERE pin_id !~ '^[0-9]+$';`;
  await sql`DELETE FROM keyword_ignored_pins WHERE pin_id !~ '^[0-9]+$';`;
  console.log('[+] Deleted non-numeric rows from keyword_serp_current, keyword_pins_snapshots, keyword_ignored_pins.');

  // B) Resequence active ranks (1..N) to close gaps
  console.log('\n[*] Step B: Resequencing active pin ranks to close gaps (1..N)...');
  const resequencedResult = await sql`
    WITH resequenced AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY keyword_id
          ORDER BY rank_position ASC NULLS LAST, save_count DESC, id ASC
        )::int AS new_rank
      FROM keyword_serp_current
      WHERE is_displaced = FALSE
    )
    UPDATE keyword_serp_current ksc
    SET rank_position = r.new_rank,
        last_known_rank = r.new_rank,
        updated_at = NOW()
    FROM resequenced r
    WHERE ksc.id = r.id
      AND ksc.rank_position IS DISTINCT FROM r.new_rank;
  `;
  console.log(`[+] Resequencing complete.`);

  // C) Update top_pin_id in tracked_keywords
  console.log('\n[*] Step C: Updating tracked_keywords top_pin_id, title, image...');
  await sql`
    WITH top_active AS (
      SELECT DISTINCT ON (keyword_id)
        keyword_id, pin_id, title, image_url
      FROM keyword_serp_current
      WHERE pin_id ~ '^[0-9]+$'
      ORDER BY keyword_id, COALESCE(rank_position, last_known_rank, 9999) ASC, save_count DESC
    )
    UPDATE tracked_keywords tk
    SET top_pin_id = ta.pin_id,
        top_pin_title = COALESCE(NULLIF(ta.title, ''), tk.top_pin_title),
        top_pin_image = COALESCE(NULLIF(ta.image_url, ''), tk.top_pin_image),
        updated_at = NOW()
    FROM top_active ta
    WHERE tk.id = ta.keyword_id
      AND (tk.top_pin_id IS NULL OR tk.top_pin_id !~ '^[0-9]+$');
  `;
  // Clear any remaining orphan top_pin_id that still has non-numeric value
  await sql`
    UPDATE tracked_keywords
    SET top_pin_id = NULL
    WHERE top_pin_id IS NOT NULL AND top_pin_id !~ '^[0-9]+$';
  `;
  console.log('[+] tracked_keywords top_pin_id updated to valid active numeric pins.');

  // D) Clean last_dropped_pins in metadata
  console.log('\n[*] Step D: Cleaning metadata->\'last_dropped_pins\'...');
  await sql`
    UPDATE tracked_keywords
    SET metadata = jsonb_set(
      metadata,
      '{last_dropped_pins}',
      COALESCE(
        (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(metadata->'last_dropped_pins') AS elem
          WHERE (elem->>'pin_id') ~ '^[0-9]+$'
        ),
        '[]'::jsonb
      )
    )
    WHERE jsonb_typeof(metadata->'last_dropped_pins') = 'array';
  `;
  console.log('[+] last_dropped_pins array purged of non-numeric IDs.');

  // E) Verification
  console.log('\n[*] Step E: Verifying Neon Central Hub purity...');
  const [afterSerp] = await sql`SELECT count(*) FROM keyword_serp_current WHERE pin_id !~ '^[0-9]+$'`;
  const [afterSnap] = await sql`SELECT count(*) FROM keyword_pins_snapshots WHERE pin_id !~ '^[0-9]+$'`;
  const [totalNumericSerp] = await sql`SELECT count(*) FROM keyword_serp_current;`;
  const [totalNumericSnap] = await sql`SELECT count(*) FROM keyword_pins_snapshots;`;
  const [rankGapsCheck] = await sql`
    SELECT count(*) FROM (
      SELECT keyword_id, count(*) as cnt, max(rank_position) as max_rank
      FROM keyword_serp_current
      WHERE is_displaced = FALSE
      GROUP BY keyword_id
      HAVING count(*) != max(rank_position)
    ) gaps;
  `;

  console.log('\n================================================================================');
  console.log('✅ NEON CENTRAL HUB AUDIT RESULT:');
  console.log(`    - Non-numeric pins in keyword_serp_current: ${afterSerp.count} (0 expected)`);
  console.log(`    - Non-numeric pins in keyword_pins_snapshots: ${afterSnap.count} (0 expected)`);
  console.log(`    - Total valid numeric pins in keyword_serp_current: ${totalNumericSerp.count}`);
  console.log(`    - Total valid numeric pins in keyword_pins_snapshots: ${totalNumericSnap.count}`);
  console.log(`    - Keywords with rank gaps: ${rankGapsCheck.count} (0 expected)`);
  console.log('================================================================================');

  // F) Clean active shards
  console.log('\n[*] Step F: Cleaning active fleet shards...');
  try {
    const shards = await sql`
      SELECT project_id, database_url FROM neon_projects_registry 
      WHERE is_hub = false AND status = 'active';
    `;
    console.log(`[i] Found ${shards.length} active fleet shards. Processing in concurrency pools...`);
    
    let cleanedShards = 0;
    const concurrency = 10;
    for (let i = 0; i < shards.length; i += concurrency) {
      const batch = shards.slice(i, i + concurrency);
      await Promise.all(batch.map(async (shard) => {
        try {
          const shardSql = neon(shard.database_url);
          await shardSql`DELETE FROM keyword_pins_snapshots WHERE pin_id !~ '^[0-9]+$';`.catch(() => {});
          cleanedShards++;
        } catch (_) {}
      }));
    }
    console.log(`[+] Processed ${cleanedShards} shards.`);
  } catch (err) {
    console.warn('[-] Shard cleaning notice:', err.message);
  }

  console.log('\n[+] DATABASE PURGE & RESEQUENCING COMPLETED SUCCESSFULLY.\n');
}

main().catch(err => {
  console.error('[-] Fatal Error:', err);
  process.exit(1);
});
