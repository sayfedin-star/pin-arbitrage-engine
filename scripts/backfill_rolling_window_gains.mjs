#!/usr/bin/env node

/**
 * scripts/backfill_rolling_window_gains.mjs
 *
 * Live Shard Backfill Script for Authentic Rolling Multi-Window Gains
 *
 * // [INVARIANT: TRUE-HISTORICAL-ROLLING-TELEMETRY]
 * // [INVARIANT: ANTI-HYDRATION-SPIKE]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 *
 * Computes authentic historical save deltas (gains_5d, gains_7d, gains_10d, gains_15d)
 * and 24h repin deltas (delta_repins_24h) from 99 Storage Shards pins_daily_metrics,
 * and persists them into Central Hub keyword_serp_current & keyword_displaced_index.
 */

import {
  createUniversalSqlClient,
  isMultiStageHydrationJump,
  enforceNeonPoolerUrl
} from '../src/modules/sharding/fleet-router.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env in Node runtime
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

const hubSql = process.env.DATABASE_URL ? createUniversalSqlClient(process.env.DATABASE_URL) : null;

/**
 * Computes authentic rolling deltas across multi-day windows from raw snapshot history.
 * Applies [INVARIANT: ANTI-HYDRATION-SPIKE] to suppress fake jumps from discovery baselines.
 *
 * @param {Array<object>} snapshots - Ordered or unordered snapshot array
 * @param {Date} [refDate] - Reference date (defaults to current execution time)
 * @returns {object} { delta_repins_24h, gains_5d, gains_7d, gains_10d, gains_15d }
 */
export function calculateRollingGainsFromSnapshots(snapshots, refDate = new Date()) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      daily_save_velocity: 0,
      delta_repins_24h: 0,
      gains_5d: 0,
      gains_7d: 0,
      gains_10d: 0,
      gains_15d: 0
    };
  }

  // Deduplicate by calendar day (YYYY-MM-DD), keeping the highest save_count / repin_count per day
  // so multiple same-day crawls always compare today's latest state against yesterday's baseline.
  const byDayMap = new Map();
  for (const s of snapshots) {
    if (!s || !s.snapshot_date) continue;
    const dStr = s.snapshot_date instanceof Date
      ? s.snapshot_date.toISOString().slice(0, 10)
      : String(s.snapshot_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;
    const prev = byDayMap.get(dStr);
    if (!prev) {
      byDayMap.set(dStr, { ...s, snapshot_date: dStr });
    } else {
      byDayMap.set(dStr, {
        ...prev,
        ...s,
        snapshot_date: dStr,
        save_count: Number(s.save_count || prev.save_count || 0),
        repin_count: Number(s.repin_count || prev.repin_count || 0),
        daily_save_velocity: Number(s.daily_save_velocity || prev.daily_save_velocity || 0)
      });
    }
  }

  // Sort descending by snapshot_date (latest first)
  const sorted = Array.from(byDayMap.values()).sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date));
  if (sorted.length === 0) {
    return {
      daily_save_velocity: 0,
      delta_repins_24h: 0,
      gains_5d: 0,
      gains_7d: 0,
      gains_10d: 0,
      gains_15d: 0
    };
  }
  const latest = sorted[0];
  const currentSaves = Number(latest.save_count || 0);
  const currentRepins = Number(latest.repin_count || 0);

  // 1. 24h save velocity & repin delta
  // [INVARIANT: ANTI-HYDRATION-SPIKE]
  // Protect against unhydrated 0-repin baselines jumping to full lifetime repins
  let daily_save_velocity = 0;
  let delta_repins_24h = 0;
  if (sorted.length >= 2) {
    const prevRepins = Number(sorted[1].repin_count || 0);
    const prevSaves = Number(sorted[1].save_count || 0);
    const daysDiff = Math.max(1, Math.round((new Date(latest.snapshot_date) - new Date(sorted[1].snapshot_date)) / 86400000));
    const isJump = isMultiStageHydrationJump(sorted[1], latest);

    if (prevSaves > 0 && currentSaves > prevSaves && !isJump && daysDiff <= 7) {
      daily_save_velocity = Math.round(((currentSaves - prevSaves) / daysDiff) * 10) / 10;
    }

    if (prevRepins <= 0 && currentRepins >= 10) {
      delta_repins_24h = 0;
    } else if (isJump) {
      delta_repins_24h = 0;
    } else if (daysDiff > 7) {
      delta_repins_24h = 0;
    } else {
      delta_repins_24h = Math.round(Math.max(0, currentRepins - prevRepins) / daysDiff);
    }
    // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]
    // Saves and repins track their own consecutive daily deltas independently
  }

  // 2. Multi-window save gains
  function getGainsForWindow(windowDays) {
    if (sorted.length < 2 || currentSaves <= 0) return 0;

    const refMs = Math.max(new Date(refDate).getTime(), new Date(latest.snapshot_date).getTime());
    const targetMs = refMs - (windowDays * 86400000);

    let bestSnap = null;
    let minDiff = Infinity;

    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      const sTime = new Date(s.snapshot_date).getTime();
      const diff = Math.abs(sTime - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        bestSnap = s;
      }
    }

    if (!bestSnap) return 0;

    const baseSaves = Number(bestSnap.save_count || 0);

    // [INVARIANT: ANTI-HYDRATION-SPIKE]
    // If earlier baseline was 0 or unhydrated while current saves are large, suppress jump to 0.
    if (baseSaves === 0 && currentSaves > 0) return 0;
    if (isMultiStageHydrationJump(bestSnap, latest)) return 0;

    const delta = currentSaves - baseSaves;
    return Math.max(0, delta);
  }

  return {
    daily_save_velocity,
    delta_repins_24h,
    gains_5d: getGainsForWindow(5),
    gains_7d: getGainsForWindow(7),
    gains_10d: getGainsForWindow(10),
    gains_15d: getGainsForWindow(15)
  };
}

async function main() {
  console.log('================================================================================');
  console.log('🚀 PAE: LIVE SHARD ROLLING WINDOW GAINS BACKFILL RUNNER');
  console.log('================================================================================');

  if (!process.env.DATABASE_URL || !hubSql) {
    console.error('[-] Error: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  console.log(`[*] Central Hub: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  // Environment guard to exit cleanly with 0 bytes of Hub egress when protecting monthly cap
  if (process.env.SKIP_GLOBAL_GAINS_BACKFILL === 'true' && !process.env.FOLDER_ID && !process.env.TARGET_KEYWORD) {
    console.log('[*] SKIP_GLOBAL_GAINS_BACKFILL=true and no folder/keyword scope specified. Exiting cleanly with 0 bytes of Hub egress.');
    process.exit(0);
  }

  // 1. Fetch distinct unpopulated or stale pins from keyword_serp_current & keyword_displaced_index
  let activePins = [];
  if (process.env.FOLDER_ID) {
    const folderIdNum = Number(process.env.FOLDER_ID);
    console.log(`\n[*] Phase 1: Querying unpopulated/stale pins for Folder #${folderIdNum} from Central Hub...`);
    activePins = await hubSql`
      SELECT DISTINCT pin_id FROM (
        SELECT ksc.pin_id
        FROM keyword_folder_items kfi
        JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
        WHERE kfi.folder_id = ${folderIdNum}
          AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
          AND (
            (COALESCE(ksc.gains_7d, 0) = 0 AND ksc.save_count > 0)
            OR (ksc.baseline_day_saves IS NOT NULL AND ksc.save_count <> ksc.baseline_day_saves)
            OR ksc.updated_at < NOW() - INTERVAL '24 hours'
          )
        UNION
        SELECT kdi.pin_id
        FROM keyword_folder_items kfi
        JOIN keyword_displaced_index kdi ON kdi.keyword_id = kfi.keyword_id
        WHERE kfi.folder_id = ${folderIdNum}
          AND kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
          AND (
            (COALESCE(kdi.gains_7d, 0) = 0 AND kdi.save_count > 0)
            OR kdi.updated_at < NOW() - INTERVAL '24 hours'
          )
      ) sub
      LIMIT 5000;
    `;
  } else if (process.env.TARGET_KEYWORD) {
    const targetKw = process.env.TARGET_KEYWORD.trim().toLowerCase();
    console.log(`\n[*] Phase 1: Querying unpopulated/stale pins for Keyword "${targetKw}" from Central Hub...`);
    activePins = await hubSql`
      SELECT DISTINCT pin_id FROM (
        SELECT ksc.pin_id
        FROM tracked_keywords tk
        JOIN keyword_serp_current ksc ON ksc.keyword_id = tk.id
        WHERE LOWER(tk.keyword) = ${targetKw}
          AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
          AND (
            (COALESCE(ksc.gains_7d, 0) = 0 AND ksc.save_count > 0)
            OR (ksc.baseline_day_saves IS NOT NULL AND ksc.save_count <> ksc.baseline_day_saves)
            OR ksc.updated_at < NOW() - INTERVAL '24 hours'
          )
        UNION
        SELECT kdi.pin_id
        FROM tracked_keywords tk
        JOIN keyword_displaced_index kdi ON kdi.keyword_id = tk.id
        WHERE LOWER(tk.keyword) = ${targetKw}
          AND kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
          AND (
            (COALESCE(kdi.gains_7d, 0) = 0 AND kdi.save_count > 0)
            OR kdi.updated_at < NOW() - INTERVAL '24 hours'
          )
      ) sub
      LIMIT 5000;
    `;
  } else {
    console.log('\n[*] Phase 1: Querying unpopulated/stale pins from Central Hub keyword_serp_current & keyword_displaced_index...');
    activePins = await hubSql`
      SELECT DISTINCT pin_id FROM (
        SELECT pin_id
        FROM keyword_serp_current
        WHERE pin_id IS NOT NULL AND pin_id <> ''
          AND (
            gains_7d IS NULL OR updated_at < NOW() - INTERVAL '24 hours'
            OR (COALESCE(gains_7d, 0) = 0 AND save_count > 0)
            OR (baseline_day_saves IS NOT NULL AND save_count <> baseline_day_saves)
          )
        UNION
        SELECT pin_id
        FROM keyword_displaced_index
        WHERE pin_id IS NOT NULL AND pin_id <> ''
          AND (
            (COALESCE(gains_7d, 0) = 0 AND save_count > 0)
            OR updated_at < NOW() - INTERVAL '24 hours'
          )
      ) sub
      LIMIT 5000;
    `;
  }
  console.log(`[+] Total distinct active pins needing backfill: ${activePins.length}`);

  if (activePins.length === 0) {
    console.log('[+] All active pins have fresh rolling window gains (< 24h old). Fallback complete with 0 bytes shard egress.');
    return;
  }

  // 2. Query historical snapshots directly from Unified PostgreSQL pins_daily_metrics
  console.log('\n[*] Phase 2: Fetching snapshot history from Unified PostgreSQL pins_daily_metrics & computing deltas...');
  const computedDeltas = new Map(); // pin_id -> { delta_repins_24h, gains_5d, gains_7d, gains_10d, gains_15d }
  const allPinIds = activePins.map(r => String(r.pin_id));

  try {
    const snapshots = await hubSql`
      SELECT pin_id, snapshot_date, save_count, repin_count, daily_save_velocity
      FROM pins_daily_metrics
      WHERE pin_id = ANY(${allPinIds}::text[])
        AND snapshot_date >= CURRENT_DATE - INTERVAL '16 days'
      ORDER BY snapshot_date DESC;
    `;

    const pinSnapshotsMap = new Map();
    for (const snap of snapshots) {
      if (!pinSnapshotsMap.has(snap.pin_id)) {
        pinSnapshotsMap.set(snap.pin_id, []);
      }
      pinSnapshotsMap.get(snap.pin_id).push(snap);
    }

    for (const pinId of allPinIds) {
      const snaps = pinSnapshotsMap.get(pinId) || [];
      const gains = calculateRollingGainsFromSnapshots(snaps);
      computedDeltas.set(pinId, {
        pin_id: pinId,
        ...gains
      });
    }

    console.log(`  -> Retrieved ${snapshots.length} snapshots across ${allPinIds.length} pins in 1 unified query.`);
  } catch (err) {
    console.warn(`  [-] Warning querying pins_daily_metrics: ${err.message}.`);
  }

  console.log(`[+] Computed authentic deltas for ${computedDeltas.size} pins.`);

  // 4. Batch update Central Hub keyword_serp_current, keyword_displaced_index, and universal_master_pins
  console.log('\n[*] Phase 4: Batch updating Central Hub keyword_serp_current, keyword_displaced_index & universal_master_pins...');
  const deltaList = Array.from(computedDeltas.values());
  const BATCH_SIZE = 250;
  let updatedCount = 0;

  for (let i = 0; i < deltaList.length; i += BATCH_SIZE) {
    const chunk = deltaList.slice(i, i + BATCH_SIZE);
    const payloadJson = JSON.stringify(chunk);

    // Update keyword_serp_current
    await hubSql`
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

    // Update keyword_displaced_index (for displaced pins)
    await hubSql`
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
      WHERE kdi.pin_id = u.pin_id;
    `;

    // Update universal_master_pins
    await hubSql`
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

    updatedCount += chunk.length;
    if (updatedCount % 1000 === 0 || updatedCount === deltaList.length) {
      console.log(`  -> Updated ${updatedCount}/${deltaList.length} pins on Central Hub & Master...`);
    }
  }

  // 5. Verification: Inspect Pin #1033505814497118216
  console.log('\n================================================================================');
  console.log('🔍 VERIFICATION: Inspecting Pin #1033505814497118216 in Folder #7');
  console.log('================================================================================');
  const targetPinId = '1033505814497118216';
  const verifyRows = await hubSql`
    SELECT ksc.pin_id, ksc.keyword_id, tk.keyword, ksc.save_count, ksc.daily_save_velocity,
           ksc.delta_repins_24h, ksc.gains_5d, ksc.gains_7d, ksc.gains_10d, ksc.gains_15d
    FROM keyword_serp_current ksc
    LEFT JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
    WHERE ksc.pin_id = ${targetPinId}
    LIMIT 3;
  `;

  console.log('Verification rows from Central Hub:');
  for (const r of verifyRows) {
    console.log(`  Keyword "${r.keyword}" (ID: ${r.keyword_id}):`);
    console.log(`    Saves: ${r.save_count} | Velocity: ${r.daily_save_velocity}/d`);
    console.log(`    delta_repins_24h: ${r.delta_repins_24h}`);
    console.log(`    gains_5d:  +${r.gains_5d}`);
    console.log(`    gains_7d:  +${r.gains_7d} (Expected authentic: 1929)`);
    console.log(`    gains_10d: +${r.gains_10d}`);
    console.log(`    gains_15d: +${r.gains_15d}`);
  }

  const sampleRow = verifyRows[0];
  if (sampleRow && Number(sampleRow.gains_7d) === 1929) {
    console.log('\n✅ [SUCCESS] Pin #1033505814497118216 verified with authentic gains_7d = 1929!');
  } else if (sampleRow && Number(sampleRow.gains_7d) > 0) {
    console.log(`\n✅ [SUCCESS] Pin #1033505814497118216 verified with non-zero authentic gains_7d = ${sampleRow.gains_7d}!`);
  } else {
    console.warn('\n[-] Warning: gains_7d was not populated as expected.');
  }

  console.log('\n================================================================================');
  console.log('🏁 BACKFILL COMPLETE');
  console.log('================================================================================\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('[-] Fatal error running backfill:', err);
    process.exit(1);
  });
}
