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
import { createSqlClient, withDbRetry } from '../src/db/client.mjs';
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

  try {
    const checkAll = process.argv.includes('--all') || process.env.REMEDIATE_ALL === 'true';
    const maxLiveCheck = checkAll ? 50000 : Math.max(100, Number(process.env.REMEDIATE_MAX_LIVE_CHECK || 400));

    // Step 1: Find top priority candidate pins with canonical_pin_id, equal save/repin count, or high velocity
    // (No DISTINCT needed because pin_id is PRIMARY KEY on universal_master_pins — avoids SQLSTATE 42P10)
    const candidateRows = await withDbRetry(() => sql`
      SELECT pin_id, save_count, repin_count, canonical_pin_id, daily_save_velocity
      FROM universal_master_pins
      WHERE (
        (canonical_pin_id IS NOT NULL AND canonical_pin_id <> '' AND canonical_pin_id <> pin_id)
        OR COALESCE(daily_save_velocity, 0) >= 50
        OR (COALESCE(save_count, 0) > 0 AND COALESCE(save_count, 0) = COALESCE(repin_count, 0) AND COALESCE(save_count, 0) >= 100)
      )
      AND pin_id ~ '^[0-9]+$'
      ORDER BY
        CASE
          WHEN COALESCE(daily_save_velocity, 0) >= 200 THEN 0
          WHEN COALESCE(save_count, 0) > 0 AND COALESCE(save_count, 0) = COALESCE(repin_count, 0) THEN 1
          WHEN COALESCE(last_scraped_at, updated_at) >= NOW() - INTERVAL '48 hours' THEN 2
          ELSE 3
        END ASC,
        COALESCE(daily_save_velocity, 0) DESC,
        pin_id ASC
      LIMIT ${maxLiveCheck};
    `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

    console.log(`[*] Found ${candidateRows.length} candidate pins for live PinResource verification (cap=${maxLiveCheck})...`);

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
            await withDbRetry(() => sql`
              UPDATE pins_daily_metrics
              SET
                save_count = LEAST(save_count, ${trueSaves}::bigint),
                daily_save_velocity = CASE WHEN save_count > ${trueSaves}::bigint THEN 0 ELSE daily_save_velocity END,
                updated_at = NOW()
              WHERE pin_id = ${row.pin_id}
                AND save_count > ${trueSaves}::bigint;
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });

            await withDbRetry(() => sql`
              UPDATE pins_daily_metrics
              SET
                save_count = ${trueSaves}::bigint,
                repin_count = GREATEST(repin_count, ${trueRepins}::int),
                updated_at = NOW()
              WHERE pin_id = ${row.pin_id}
                AND snapshot_date = (NOW() AT TIME ZONE 'UTC')::date;
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });

            await withDbRetry(() => sql`
              UPDATE universal_master_pins
              SET
                save_count = ${trueSaves}::bigint,
                repin_count = GREATEST(COALESCE(repin_count, 0), ${trueRepins}::int),
                updated_at = NOW()
              WHERE pin_id = ${row.pin_id};
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });

            await withDbRetry(() => sql`
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
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });

            await withDbRetry(() => sql`
              UPDATE keyword_displaced_index
              SET
                save_count = ${trueSaves}::bigint,
                repin_count = GREATEST(COALESCE(repin_count, 0), ${trueRepins}::int),
                updated_at = NOW()
              WHERE pin_id = ${row.pin_id};
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });

            await withDbRetry(() => sql`
              UPDATE competitor_pins
              SET save_count = ${trueSaves}::bigint, updated_at = NOW()
              WHERE pin_id = ${row.pin_id} AND save_count > ${trueSaves}::bigint;
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 }).catch(() => {});

            await withDbRetry(() => sql`
              UPDATE pa_pins
              SET saves = ${trueSaves}::bigint, last_updated_at = NOW()
              WHERE pin_id = ${row.pin_id} AND saves > ${trueSaves}::bigint;
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 }).catch(() => {});
          }
        } catch (_) {}

        if ((currentIdx + 1) % 100 === 0 || currentIdx + 1 === candidateRows.length) {
          console.log(`  [Progress] Checked ${currentIdx + 1}/${candidateRows.length} pins (${correctedCount} save_count records repaired)...`);
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // Step 2: Recompute authentic 24h velocity & rolling gains across all active, displaced & non-zero UMP pins
    console.log('\n[*] Recomputing authentic 24h velocity & rolling gains from pins_daily_metrics...');
    const allTrackedPins = await withDbRetry(() => sql`
      SELECT pin_id FROM (
        SELECT pin_id FROM keyword_serp_current WHERE pin_id IS NOT NULL
        UNION
        SELECT pin_id FROM keyword_displaced_index WHERE pin_id IS NOT NULL
        UNION
        SELECT pin_id FROM universal_master_pins
        WHERE COALESCE(daily_save_velocity, 0) > 0
           OR COALESCE(delta_saves_24h, 0) > 0
           OR COALESCE(delta_repins_24h, 0) > 0
           OR COALESCE(gains_5d, 0) > 0
           OR COALESCE(gains_7d, 0) > 0
      ) t;
    `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

    const pinIds = allTrackedPins.map(r => String(r.pin_id));
    console.log(`[*] Total tracked pins to reconcile: ${pinIds.length}`);

    const CHUNK_SIZE = 500;
    for (let i = 0; i < pinIds.length; i += CHUNK_SIZE) {
      const chunkIds = pinIds.slice(i, i + CHUNK_SIZE);
      const [snaps, freshKsc] = await withDbRetry(() => Promise.all([
        sql`
          SELECT pin_id, snapshot_date, save_count, repin_count, daily_save_velocity
          FROM pins_daily_metrics
          WHERE pin_id = ANY(${chunkIds}::text[])
            AND snapshot_date >= CURRENT_DATE - INTERVAL '16 days'
          ORDER BY snapshot_date DESC;
        `,
        sql`
          SELECT pin_id, (crawled_at AT TIME ZONE 'UTC')::date AS snapshot_date,
                 save_count, repin_count, daily_save_velocity
          FROM keyword_serp_current
          WHERE pin_id = ANY(${chunkIds}::text[])
            AND crawled_at >= NOW() - INTERVAL '48 hours'
            AND save_count > 0;
        `
      ]), { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

      const snapMap = new Map();
      for (const s of snaps) {
        if (!snapMap.has(s.pin_id)) snapMap.set(s.pin_id, []);
        snapMap.get(s.pin_id).push(s);
      }
      for (const kRow of freshKsc) {
        if (!snapMap.has(kRow.pin_id)) snapMap.set(kRow.pin_id, []);
        snapMap.get(kRow.pin_id).push(kRow);
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

      await withDbRetry(() => sql`
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
        WHERE ksc.pin_id = u.pin_id
          AND (
            ksc.daily_save_velocity IS DISTINCT FROM COALESCE(u.daily_save_velocity, 0)
            OR ksc.delta_repins_24h IS DISTINCT FROM COALESCE(u.delta_repins_24h, 0)
            OR ksc.gains_5d IS DISTINCT FROM COALESCE(u.gains_5d, 0)
            OR ksc.gains_7d IS DISTINCT FROM COALESCE(u.gains_7d, 0)
            OR ksc.gains_10d IS DISTINCT FROM COALESCE(u.gains_10d, 0)
            OR ksc.gains_15d IS DISTINCT FROM COALESCE(u.gains_15d, 0)
          );
      `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

      await withDbRetry(() => sql`
        UPDATE keyword_displaced_index kdi
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
        WHERE kdi.pin_id = u.pin_id
          AND (
            kdi.daily_save_velocity IS DISTINCT FROM COALESCE(u.daily_save_velocity, 0)
            OR kdi.delta_repins_24h IS DISTINCT FROM COALESCE(u.delta_repins_24h, 0)
            OR kdi.gains_5d IS DISTINCT FROM COALESCE(u.gains_5d, 0)
            OR kdi.gains_7d IS DISTINCT FROM COALESCE(u.gains_7d, 0)
            OR kdi.gains_10d IS DISTINCT FROM COALESCE(u.gains_10d, 0)
            OR kdi.gains_15d IS DISTINCT FROM COALESCE(u.gains_15d, 0)
          );
      `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

      await withDbRetry(() => sql`
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
        WHERE ump.pin_id = u.pin_id
          AND (
            ump.daily_save_velocity IS DISTINCT FROM COALESCE(u.daily_save_velocity, 0)
            OR ump.delta_saves_24h IS DISTINCT FROM ROUND(COALESCE(u.daily_save_velocity, 0))::int
            OR ump.delta_repins_24h IS DISTINCT FROM COALESCE(u.delta_repins_24h, 0)
            OR ump.gains_5d IS DISTINCT FROM COALESCE(u.gains_5d, 0)
            OR ump.gains_7d IS DISTINCT FROM COALESCE(u.gains_7d, 0)
            OR ump.gains_10d IS DISTINCT FROM COALESCE(u.gains_10d, 0)
            OR ump.gains_15d IS DISTINCT FROM COALESCE(u.gains_15d, 0)
          );
      `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

      await withDbRetry(() => sql`
        UPDATE pins_daily_metrics pm
        SET
          daily_save_velocity = COALESCE(u.daily_save_velocity, 0),
          updated_at = NOW()
        FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
          pin_id text,
          daily_save_velocity numeric
        )
        WHERE pm.pin_id = u.pin_id
          AND pm.snapshot_date = (NOW() AT TIME ZONE 'UTC')::date
          AND pm.daily_save_velocity IS DISTINCT FROM COALESCE(u.daily_save_velocity, 0);
      `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });
    }

    // Step 3: Synchronize pa_pins and competitor_pins velocities with universal_master_pins & decay >48h stale velocities
    console.log('\n[*] Synchronizing pa_pins & competitor_pins velocities and decaying >48h stale velocities...');
    await withDbRetry(() => sql`
      UPDATE pa_pins pa
      SET velocity = CASE
        WHEN COALESCE(ump.last_scraped_at, ump.updated_at, pa.last_updated_at) >= NOW() - INTERVAL '48 hours'
        THEN COALESCE(ump.daily_save_velocity, 0)
        ELSE 0
      END
      FROM universal_master_pins ump
      WHERE pa.pin_id = ump.pin_id
        AND pa.velocity IS DISTINCT FROM (
          CASE
            WHEN COALESCE(ump.last_scraped_at, ump.updated_at, pa.last_updated_at) >= NOW() - INTERVAL '48 hours'
            THEN COALESCE(ump.daily_save_velocity, 0)
            ELSE 0
          END
        );
    `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

    await withDbRetry(() => sql`
      UPDATE pa_pins
      SET velocity = 0
      WHERE velocity > 0
        AND last_updated_at < NOW() - INTERVAL '48 hours';
    `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

    await withDbRetry(() => sql`
      UPDATE competitor_pins cp
      SET metadata = (cp.metadata - 'daily_save_velocity' - 'delta_saves_24h' - 'delta_repins_24h')
      WHERE cp.updated_at < NOW() - INTERVAL '48 hours'
        AND cp.metadata ?| array['daily_save_velocity', 'delta_saves_24h', 'delta_repins_24h'];
    `, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 });

    console.log('\n✅ Remediation & Velocity Reconciliation Complete!');
  } finally {
    if (sql && typeof sql.end === 'function') {
      try {
        await sql.end({ timeout: 3 });
      } catch (_) {}
    }
  }
}

main().catch(err => {
  console.error('[-] Fatal Remediation Error:', err);
  process.exit(1);
});
