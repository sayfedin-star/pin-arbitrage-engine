#!/usr/bin/env node

/**
 * scripts/remediate_poisoned_canonical_and_velocity.mjs
 *
 * Forensic Remediation & Live Truth Reconciliation Script:
 * 1. Finds all pins in the Unified PostgreSQL database that have a canonical_pin_id
 *    or suspiciously inflated save_count / daily_save_velocity.
 * 2. Queries live Pinterest PinResource directly (zero canonical hop) to obtain each pin's
 *    authentic save_count and repin_count.
 * 3. Repairs polluted save_count rows across universal_master_pins, pins_daily_metrics,
 *    keyword_serp_current, keyword_displaced_index, competitor_pins, and pa_pins.
 * 4. Recomputes exact 24h velocity & rolling window gains (5d/7d/10d/15d) from clean snapshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createSqlClient } from '../src/db/client.mjs';
import { fetchPinFromPinResource } from './lib/pinterest.mjs';
import { calculateRollingGainsFromSnapshots } from './backfill_rolling_window_gains.mjs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
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
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (_) {}
}

const sql = process.env.DATABASE_URL ? createSqlClient(process.env.DATABASE_URL) : null;

async function main() {
  console.log('================================================================================');
  console.log('🧹 PAE: CANONICAL PIN & MONOTONIC VELOCITY REMEDIATION RUNNER');
  console.log('================================================================================');

  if (!sql) {
    console.error('[-] DATABASE_URL is required.');
    process.exit(1);
  }

  // Step 1: Find all candidate pins with canonical_pin_id or inflated velocity
  const candidateRows = await sql`
    SELECT DISTINCT pin_id, save_count, repin_count, canonical_pin_id, daily_save_velocity
    FROM universal_master_pins
    WHERE (
      (canonical_pin_id IS NOT NULL AND canonical_pin_id <> '' AND canonical_pin_id <> pin_id)
      OR COALESCE(daily_save_velocity, 0) >= 50
    )
    AND pin_id ~ '^[0-9]+$'
    ORDER BY COALESCE(daily_save_velocity, 0) DESC;
  `;

  console.log(`[*] Found ${candidateRows.length} candidate pins for live PinResource verification...`);

  const CONCURRENCY = 12;
  let idx = 0;
  let correctedCount = 0;

  async function worker() {
    while (idx < candidateRows.length) {
      const currentIdx = idx++;
      const row = candidateRows[currentIdx];
      if (!row || !row.pin_id) continue;

      try {
        const livePin = await fetchPinFromPinResource(row.pin_id, undefined, false);
        if (!livePin || (!livePin.has_explicit_saves && livePin.saves === 0 && livePin.repins === 0)) {
          continue;
        }

        const trueSaves = Number(livePin.saves || 0);
        const trueRepins = Math.max(Number(row.repin_count || 0), Number(livePin.repins || 0));
        const dbSaves = Number(row.save_count || 0);

        if (livePin.has_explicit_saves && trueSaves !== dbSaves) {
          correctedCount++;
          // Correct historical snapshots that had repin-polluted or canonical-polluted save_count > trueSaves
          await sql`
            UPDATE pins_daily_metrics
            SET
              save_count = LEAST(save_count, ${trueSaves}::bigint),
              daily_save_velocity = CASE WHEN save_count > ${trueSaves}::bigint THEN 0 ELSE daily_save_velocity END,
              updated_at = NOW()
            WHERE pin_id = ${row.pin_id}
              AND save_count > ${trueSaves}::bigint;
          `;

          await sql`
            UPDATE pins_daily_metrics
            SET
              save_count = ${trueSaves}::bigint,
              repin_count = GREATEST(repin_count, ${trueRepins}::int),
              updated_at = NOW()
            WHERE pin_id = ${row.pin_id}
              AND snapshot_date = (NOW() AT TIME ZONE 'UTC')::date;
          `;

          await sql`
            UPDATE universal_master_pins
            SET
              save_count = ${trueSaves}::bigint,
              repin_count = GREATEST(COALESCE(repin_count, 0), ${trueRepins}::int),
              updated_at = NOW()
            WHERE pin_id = ${row.pin_id};
          `;

          await sql`
            UPDATE keyword_serp_current
            SET
              save_count = ${trueSaves}::bigint,
              repin_count = GREATEST(COALESCE(repin_count, 0), ${trueRepins}::int),
              baseline_day_saves = CASE
                WHEN baseline_day_saves IS NOT NULL AND baseline_day_saves > ${trueSaves}::bigint
                THEN ${trueSaves}::bigint
                ELSE baseline_day_saves
              END,
              updated_at = NOW()
            WHERE pin_id = ${row.pin_id};
          `;

          await sql`
            UPDATE keyword_displaced_index
            SET
              save_count = ${trueSaves}::bigint,
              repin_count = GREATEST(COALESCE(repin_count, 0), ${trueRepins}::int),
              updated_at = NOW()
            WHERE pin_id = ${row.pin_id};
          `;

          await sql`
            UPDATE competitor_pins
            SET save_count = ${trueSaves}::bigint, updated_at = NOW()
            WHERE pin_id = ${row.pin_id} AND save_count > ${trueSaves}::bigint;
          `.catch(() => {});

          await sql`
            UPDATE pa_pins
            SET saves = ${trueSaves}::bigint, last_updated_at = NOW()
            WHERE pin_id = ${row.pin_id} AND saves > ${trueSaves}::bigint;
          `.catch(() => {});
        }
      } catch (_) {}

      if ((currentIdx + 1) % 100 === 0 || currentIdx + 1 === candidateRows.length) {
        console.log(`  [Progress] Checked ${currentIdx + 1}/${candidateRows.length} pins (${correctedCount} save_count records repaired)...`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Step 2: Recompute authentic 24h velocity & rolling gains across all active & displaced pins
  console.log('\n[*] Recomputing authentic 24h velocity & rolling gains from pins_daily_metrics...');
  const allTrackedPins = await sql`
    SELECT DISTINCT pin_id FROM (
      SELECT pin_id FROM keyword_serp_current WHERE pin_id IS NOT NULL
      UNION
      SELECT pin_id FROM keyword_displaced_index WHERE pin_id IS NOT NULL
      UNION
      SELECT pin_id FROM universal_master_pins WHERE COALESCE(daily_save_velocity, 0) > 0 OR COALESCE(delta_repins_24h, 0) > 0
    ) t;
  `;

  const pinIds = allTrackedPins.map(r => String(r.pin_id));
  console.log(`[*] Total tracked pins to reconcile: ${pinIds.length}`);

  const CHUNK_SIZE = 500;
  for (let i = 0; i < pinIds.length; i += CHUNK_SIZE) {
    const chunkIds = pinIds.slice(i, i + CHUNK_SIZE);
    const snaps = await sql`
      SELECT pin_id, snapshot_date, save_count, repin_count, daily_save_velocity
      FROM pins_daily_metrics
      WHERE pin_id = ANY(${chunkIds}::text[])
        AND snapshot_date >= CURRENT_DATE - INTERVAL '16 days'
      ORDER BY snapshot_date DESC;
    `;

    const snapMap = new Map();
    for (const s of snaps) {
      if (!snapMap.has(s.pin_id)) snapMap.set(s.pin_id, []);
      snapMap.get(s.pin_id).push(s);
    }

    const updates = [];
    for (const pid of chunkIds) {
      const pSnaps = snapMap.get(pid) || [];
      const gains = calculateRollingGainsFromSnapshots(pSnaps);
      updates.push({
        pin_id: pid,
        daily_save_velocity: gains.daily_save_velocity,
        delta_repins_24h: gains.delta_repins_24h,
        gains_5d: gains.gains_5d,
        gains_7d: gains.gains_7d,
        gains_10d: gains.gains_10d,
        gains_15d: gains.gains_15d
      });
    }

    const payloadJson = JSON.stringify(updates);

    await sql`
      UPDATE keyword_serp_current ksc
      SET
        daily_save_velocity = COALESCE(u.daily_save_velocity, 0),
        delta_repins_24h = COALESCE(u.delta_repins_24h, 0),
        gains_5d = COALESCE(u.gains_5d, 0),
        gains_7d = COALESCE(u.gains_7d, 0),
        gains_10d = COALESCE(u.gains_10d, 0),
        gains_15d = COALESCE(u.gains_15d, 0),
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        daily_save_velocity numeric,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int
      )
      WHERE ksc.pin_id = u.pin_id;
    `;

    await sql`
      UPDATE keyword_displaced_index kdi
      SET
        daily_save_velocity = COALESCE(u.daily_save_velocity, 0),
        delta_saves_24h = ROUND(COALESCE(u.daily_save_velocity, 0))::int,
        delta_repins_24h = COALESCE(u.delta_repins_24h, 0),
        gains_5d = COALESCE(u.gains_5d, 0),
        gains_7d = COALESCE(u.gains_7d, 0),
        gains_10d = COALESCE(u.gains_10d, 0),
        gains_15d = COALESCE(u.gains_15d, 0),
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        daily_save_velocity numeric,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int
      )
      WHERE kdi.pin_id = u.pin_id;
    `;

    await sql`
      UPDATE universal_master_pins ump
      SET
        daily_save_velocity = COALESCE(u.daily_save_velocity, 0),
        delta_saves_24h = ROUND(COALESCE(u.daily_save_velocity, 0))::int,
        delta_repins_24h = COALESCE(u.delta_repins_24h, 0),
        gains_5d = COALESCE(u.gains_5d, 0),
        gains_7d = COALESCE(u.gains_7d, 0),
        gains_10d = COALESCE(u.gains_10d, 0),
        gains_15d = COALESCE(u.gains_15d, 0),
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        daily_save_velocity numeric,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int
      )
      WHERE ump.pin_id = u.pin_id;
    `;

    await sql`
      UPDATE pins_daily_metrics pm
      SET
        daily_save_velocity = COALESCE(u.daily_save_velocity, 0),
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        daily_save_velocity numeric
      )
      WHERE pm.pin_id = u.pin_id
        AND pm.snapshot_date = (NOW() AT TIME ZONE 'UTC')::date;
    `;
  }

  console.log('\n✅ Remediation & Velocity Reconciliation Complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('[-] Fatal Remediation Error:', err);
  process.exit(1);
});
