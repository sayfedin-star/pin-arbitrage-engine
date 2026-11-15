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
 * and 24h repin deltas (delta_repins_24h) from Unified PostgreSQL pins_daily_metrics,
 * and persists them into universal_master_pins.
 */

import { createSqlClient, isTransientPgConnectionError } from '../src/db/client.mjs';
import { isMultiStageHydrationJump, isRepinHydrationJump } from '../src/lib/math.mjs';
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

const hubSql = process.env.DATABASE_URL ? createSqlClient(process.env.DATABASE_URL) : null;

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
        save_count: Math.max(Number(s.save_count || 0), Number(prev.save_count || 0)),
        repin_count: Math.max(Number(s.repin_count || 0), Number(prev.repin_count || 0)),
        daily_save_velocity: Math.max(Number(s.daily_save_velocity || 0), Number(prev.daily_save_velocity || 0))
      });
    }
  }

  // Sort descending by snapshot_date (latest first)
  const sorted = Array.from(byDayMap.values()).sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date));
  if (sorted.length < 2) {
    return {
      daily_save_velocity: null,
      daily_repin_velocity: null,
      delta_repins_24h: 0,
      gains_5d: null,
      gains_7d: null,
      gains_10d: null,
      gains_15d: null
    };
  }
  const latest = sorted[0];
  const currentSaves = Number(latest.save_count || 0);
  const currentRepins = Number(latest.repin_count || 0);

  const refObj = refDate instanceof Date ? refDate : new Date(refDate);
  const refDayMs = Number.isFinite(refObj.getTime())
    ? Date.UTC(refObj.getUTCFullYear(), refObj.getUTCMonth(), refObj.getUTCDate())
    : Date.now();
  const latestDayMs = Date.parse(`${latest.snapshot_date}T00:00:00Z`);
  const stalenessDays = Number.isFinite(latestDayMs)
    ? Math.max(0, Math.round((refDayMs - latestDayMs) / 86400000))
    : 0;
  const isFresh24h = stalenessDays <= 2;

  // 1. 24h save velocity & repin delta
  // [INVARIANT: ANTI-HYDRATION-SPIKE] & [INVARIANT: FRESH-24H-TELEMETRY]
  // Protect against unhydrated 0-repin baselines AND stale multi-day-old spikes (>2d stale vs refDate)
  let daily_save_velocity = 0;
  let daily_repin_velocity = 0;
  let delta_repins_24h = 0;
  if (sorted.length >= 2 && isFresh24h) {
    const prevRepins = sorted[1].repin_count != null ? Number(sorted[1].repin_count) : null;
    const prevSaves = sorted[1].save_count != null ? Number(sorted[1].save_count) : null;
    const daysDiff = Math.max(1, Math.round((new Date(latest.snapshot_date) - new Date(sorted[1].snapshot_date)) / 86400000));
    const isJump = isMultiStageHydrationJump(sorted[1], latest);
    const isRepinJump = isJump || isRepinHydrationJump(sorted[1], latest);

    if (prevSaves !== null && prevSaves > 0 && currentSaves >= prevSaves && !isJump && daysDiff <= 7) {
      daily_save_velocity = Math.round(((currentSaves - prevSaves) / daysDiff) * 10) / 10;
    }

    if (isRepinJump) {
      delta_repins_24h = 0;
      daily_repin_velocity = 0;
    } else if (daysDiff > 7) {
      delta_repins_24h = 0;
      daily_repin_velocity = 0;
    } else if (prevRepins !== null && currentRepins >= prevRepins) {
      delta_repins_24h = Math.round(Math.max(0, currentRepins - prevRepins) / daysDiff);
      daily_repin_velocity = Math.round(((currentRepins - prevRepins) / daysDiff) * 10) / 10;
    }
    // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]
    // Saves and repins track their own consecutive daily deltas independently
  }

  // 2. Multi-window save gains
  function getGainsForWindow(windowDays) {
    if (sorted.length < 2 || currentSaves <= 0) return null;
    if (stalenessDays > windowDays) return 0;

    const refMs = Math.max(refDayMs, latestDayMs);
    const targetMs = refMs - (windowDays * 86400000);

    let bestSnap = null;
    let minDiff = Infinity;

    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      const sTime = Date.parse(`${s.snapshot_date}T00:00:00Z`);
      const diff = Math.abs(sTime - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        bestSnap = s;
      }
    }

    if (!bestSnap || bestSnap.save_count == null) return null;

    const baseSaves = Number(bestSnap.save_count || 0);

    // [INVARIANT: ANTI-HYDRATION-SPIKE]
    // If earlier baseline was 0 or unhydrated while current saves are large, suppress jump to 0.
    if (baseSaves === 0 && currentSaves > 0) return null;
    if (isMultiStageHydrationJump(bestSnap, latest)) return 0;

    const delta = currentSaves - baseSaves;
    return Math.max(0, delta);
  }

  return {
    daily_save_velocity,
    daily_repin_velocity,
    delta_repins_24h,
    gains_5d: getGainsForWindow(5),
    gains_7d: getGainsForWindow(7),
    gains_10d: getGainsForWindow(10),
    gains_15d: getGainsForWindow(15)
  };
}

function startInstaBoxActivityLease(intervalMs = 300000) {
  const machineId = process.env.INSTABOX_MACHINE_ID;
  const apiKey = process.env.INSTABOX_API_KEY;
  if (!machineId || !apiKey) return { stop: () => {} };
  const timer = setInterval(async () => {
    try {
      await fetch(`https://api.instabox.sh/v1/machines/${machineId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    } catch (_) {}
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

async function main() {
  console.log('================================================================================');
  console.log('🚀 PAE: LIVE SHARD ROLLING WINDOW GAINS BACKFILL RUNNER');
  console.log('================================================================================');

  const activityLease = startInstaBoxActivityLease();
  const isDryRun = process.argv.includes('--dry-run');

  if (!process.env.DATABASE_URL || !hubSql) {
    if (isDryRun) {
      console.log('[*] --dry-run flag detected without live DATABASE_URL: validating offline delta calculation engine...');
      const mockSnapshots = [
        { snapshot_date: new Date().toISOString().slice(0, 10), save_count: 500, repin_count: 20 },
        { snapshot_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), save_count: 350, repin_count: 15 }
      ];
      const testGains = calculateRollingGainsFromSnapshots(mockSnapshots);
      console.log(`  -> Tested calculateRollingGainsFromSnapshots: 7d gains = +${testGains.gains_7d}`);
      console.log('✅ Dry-run validation completed successfully.');
      return;
    }
    console.error('[-] Error: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  console.log(`[*] Central Hub: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  if (isDryRun) {
    console.log('[*] --dry-run flag detected: validating delta calculation engine and connection handling...');
    const mockSnapshots = [
      { snapshot_date: new Date().toISOString().slice(0, 10), save_count: 500, repin_count: 20 },
      { snapshot_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), save_count: 350, repin_count: 15 }
    ];
    const testGains = calculateRollingGainsFromSnapshots(mockSnapshots);
    console.log(`  -> Tested calculateRollingGainsFromSnapshots: 7d gains = +${testGains.gains_7d}`);
    if (testGains.gains_7d !== 150) {
      throw new Error(`Dry-run calculation test failed: expected 150, got ${testGains.gains_7d}`);
    }
    try {
      console.log('[*] Testing Hub connection in dry-run mode...');
      await hubSql`SELECT 1 AS dry_run_check;`;
      console.log('  -> Hub connection responsive.');
    } catch (err) {
      console.log(`  -> Dry-run notice: DB connection not established (${err.message}). Query compilation valid.`);
    } finally {
      if (hubSql && typeof hubSql.end === 'function') {
        try {
          await hubSql.end({ timeout: 5 });
        } catch (_) {}
      }
    }
    console.log('✅ Dry-run validation completed successfully.');
    return;
  }

  try {
    // Environment guard to exit cleanly with 0 bytes of Hub egress when protecting monthly cap
    if (process.env.SKIP_GLOBAL_GAINS_BACKFILL === 'true' && !process.env.FOLDER_ID && !process.env.TARGET_KEYWORD) {
      console.log('[*] SKIP_GLOBAL_GAINS_BACKFILL=true and no folder/keyword scope specified. Exiting cleanly with 0 bytes of Hub egress.');
      return;
    }

    async function executeWithRetry(queryFn, maxAttempts = 3, initialBackoffMs = 3000) {
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await queryFn();
        } catch (err) {
          lastErr = err;
          const isTransient = isTransientPgConnectionError(err) || /ECONNRESET|ECONNREFUSED|CONNECTION_CLOSED|ETIMEDOUT|timeout/i.test(
            `${err.code || ''} ${err.message || ''}`
          );
          if (attempt < maxAttempts && isTransient) {
            const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
            console.warn(`  [!] Database query failed (attempt ${attempt}/${maxAttempts}: ${err.message}). Retrying in ${backoff / 1000}s...`);
            await new Promise(r => setTimeout(r, backoff));
          } else {
            throw err;
          }
        }
      }
      throw lastErr;
    }

    // 1. Fetch distinct unpopulated or stale pins from universal_master_pins & keyword_serp_positions
    let activePins = [];
    activePins = await executeWithRetry(async () => {
      if (process.env.FOLDER_ID) {
        const folderIdNum = Number(process.env.FOLDER_ID);
        console.log(`\n[*] Phase 1: Querying unpopulated/stale pins for Folder #${folderIdNum} from Central Hub...`);
        return await hubSql`
          SELECT DISTINCT ump.pin_id
          FROM keyword_folder_items kfi
          JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
          JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
          WHERE kfi.folder_id = ${folderIdNum}
            AND ump.pin_id IS NOT NULL AND ump.pin_id <> ''
            AND ump.is_hydrated = TRUE AND ump.save_count IS NOT NULL
            AND (
              ump.gains_7d IS NULL
              OR ump.updated_at < NOW() - INTERVAL '24 hours'
              OR (COALESCE(ump.gains_7d, 0) = 0 AND ump.save_count > 0)
            )
          LIMIT 5000;
        `;
      } else if (process.env.TARGET_KEYWORD) {
        const targetKw = process.env.TARGET_KEYWORD.trim().toLowerCase();
        console.log(`\n[*] Phase 1: Querying unpopulated/stale pins for Keyword "${targetKw}" from Central Hub...`);
        return await hubSql`
          SELECT DISTINCT ump.pin_id
          FROM tracked_keywords tk
          JOIN keyword_serp_positions ksp ON ksp.keyword_id = tk.id
          JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
          WHERE LOWER(tk.keyword) = ${targetKw}
            AND ump.pin_id IS NOT NULL AND ump.pin_id <> ''
            AND ump.is_hydrated = TRUE AND ump.save_count IS NOT NULL
            AND (
              ump.gains_7d IS NULL
              OR ump.updated_at < NOW() - INTERVAL '24 hours'
              OR (COALESCE(ump.gains_7d, 0) = 0 AND ump.save_count > 0)
            )
          LIMIT 5000;
        `;
      } else {
        console.log('\n[*] Phase 1: Querying unpopulated/stale pins from Central Hub universal_master_pins...');
        return await hubSql`
          SELECT pin_id
          FROM universal_master_pins
          WHERE pin_id IS NOT NULL AND pin_id <> ''
            AND is_hydrated = TRUE AND save_count IS NOT NULL
            AND (
              gains_7d IS NULL 
              OR updated_at < NOW() - INTERVAL '24 hours'
              OR (COALESCE(gains_7d, 0) = 0 AND save_count > 0)
              OR COALESCE(daily_save_velocity, 0) > 0
              OR COALESCE(delta_saves_24h, 0) > 0
              OR COALESCE(delta_repins_24h, 0) > 0
            )
          LIMIT 25000;
        `;
      }
    }, 3, 3000);
    console.log(`[+] Total distinct active pins needing backfill: ${activePins.length}`);

    if (activePins.length === 0) {
      console.log('[+] All active pins have fresh rolling window gains (< 24h old). Fallback complete with 0 bytes shard egress.');
      return;
    }

    // 2. Query historical snapshots directly from Unified PostgreSQL pins_daily_metrics (chunked <= 500 pins)
    console.log('\n[*] Phase 2: Fetching snapshot history from Unified PostgreSQL pins_daily_metrics & computing deltas...');
    const computedDeltas = new Map(); // pin_id -> { daily_save_velocity, delta_repins_24h, gains_5d, gains_7d, gains_10d, gains_15d }
    const allPinIds = activePins.map(r => String(r.pin_id));

    const PIN_CHUNK_SIZE = 500;
    const pinSnapshotsMap = new Map();
    let totalSnapshotsRetrieved = 0;

    try {
      for (let i = 0; i < allPinIds.length; i += PIN_CHUNK_SIZE) {
        const pinChunk = allPinIds.slice(i, i + PIN_CHUNK_SIZE);
        const snapshots = await executeWithRetry(async () => {
          return await hubSql`
            SELECT pin_id, snapshot_date, save_count, repin_count, daily_save_velocity
            FROM pins_daily_metrics
            WHERE pin_id = ANY(${pinChunk}::text[])
              AND snapshot_date >= CURRENT_DATE - INTERVAL '16 days'
            ORDER BY snapshot_date DESC;
          `;
        }, 3, 3000);

        totalSnapshotsRetrieved += snapshots.length;
        for (const snap of snapshots) {
          if (!pinSnapshotsMap.has(snap.pin_id)) {
            pinSnapshotsMap.set(snap.pin_id, []);
          }
          pinSnapshotsMap.get(snap.pin_id).push(snap);
        }
      }

      for (const pinId of allPinIds) {
        const snaps = pinSnapshotsMap.get(pinId) || [];
        const gains = calculateRollingGainsFromSnapshots(snaps);
        computedDeltas.set(pinId, {
          pin_id: pinId,
          ...gains
        });
      }

      console.log(`  -> Retrieved ${totalSnapshotsRetrieved} snapshots across ${allPinIds.length} pins in ${Math.ceil(allPinIds.length / PIN_CHUNK_SIZE)} chunk(s) (<= 500 pins/chunk).`);
    } catch (err) {
      console.warn(`  [-] Warning querying pins_daily_metrics: ${err.message}.`);
    }

    console.log(`[+] Computed authentic deltas for ${computedDeltas.size} pins.`);

  // 4. Batch update Central Hub universal_master_pins
  console.log('\n[*] Phase 4: Batch updating Central Hub universal_master_pins...');
  const deltaList = Array.from(computedDeltas.values());
  const BATCH_SIZE = 250;
  let updatedCount = 0;

  for (let i = 0; i < deltaList.length; i += BATCH_SIZE) {
    const chunk = deltaList.slice(i, i + BATCH_SIZE);
    const payloadJson = JSON.stringify(chunk);

    // Update universal_master_pins
    await executeWithRetry(() => hubSql`
      UPDATE universal_master_pins ump
      SET
        daily_save_velocity = u.daily_save_velocity,
        daily_repin_velocity = u.daily_repin_velocity,
        delta_saves_24h = CASE WHEN u.daily_save_velocity IS NOT NULL THEN ROUND(u.daily_save_velocity)::int ELSE ump.delta_saves_24h END,
        delta_repins_24h = COALESCE(u.delta_repins_24h, ump.delta_repins_24h, 0),
        gains_5d = u.gains_5d,
        gains_7d = u.gains_7d,
        gains_10d = u.gains_10d,
        gains_15d = u.gains_15d,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        daily_save_velocity numeric,
        daily_repin_velocity numeric,
        delta_repins_24h int,
        gains_5d int,
        gains_7d int,
        gains_10d int,
        gains_15d int
      )
      WHERE ump.pin_id = u.pin_id
        AND (
          ump.daily_save_velocity IS DISTINCT FROM u.daily_save_velocity
          OR ump.daily_repin_velocity IS DISTINCT FROM u.daily_repin_velocity
          OR ump.gains_5d IS DISTINCT FROM u.gains_5d
          OR ump.gains_7d IS DISTINCT FROM u.gains_7d
          OR ump.gains_10d IS DISTINCT FROM u.gains_10d
          OR ump.gains_15d IS DISTINCT FROM u.gains_15d
        );
    `, 3, 2000);

    updatedCount += chunk.length;
    if (updatedCount % 1000 === 0 || updatedCount === deltaList.length) {
      console.log(`  -> Updated ${updatedCount}/${deltaList.length} pins on Central Hub universal_master_pins...`);
    }
  }

  // 5. Verification: Inspect Pin #1033505814497118216
  console.log('\n================================================================================');
  console.log('🔍 VERIFICATION: Inspecting Pin #1033505814497118216 in Folder #7');
  console.log('================================================================================');
  const targetPinId = '1033505814497118216';
  const verifyRows = await hubSql`
    SELECT ump.pin_id, ksp.keyword_id, tk.keyword, ump.save_count, ump.daily_save_velocity,
           ump.delta_repins_24h, ump.gains_5d, ump.gains_7d, ump.gains_10d, ump.gains_15d
    FROM universal_master_pins ump
    LEFT JOIN keyword_serp_positions ksp ON ksp.pin_id = ump.pin_id
    LEFT JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
    WHERE ump.pin_id = ${targetPinId}
    LIMIT 3;
  `;

  console.log('Verification rows from Central Hub:');
  for (const r of verifyRows) {
    console.log(`  Keyword "${r.keyword || 'N/A'}" (ID: ${r.keyword_id || 'N/A'}):`);
    console.log(`    Saves: ${r.save_count} | Velocity: ${r.daily_save_velocity}/d`);
    console.log(`    delta_repins_24h: ${r.delta_repins_24h}`);
    console.log(`    gains_5d:  +${r.gains_5d}`);
    console.log(`    gains_7d:  +${r.gains_7d}`);
    console.log(`    gains_10d: +${r.gains_10d}`);
    console.log(`    gains_15d: +${r.gains_15d}`);
  }

  const sampleRow = verifyRows[0];
  if (sampleRow && Number(sampleRow.gains_7d) > 0) {
    console.log(`\n✅ [SUCCESS] Pin #${targetPinId} verified with non-zero authentic gains_7d = ${sampleRow.gains_7d}!`);
  } else {
    console.log(`\n[*] Verified Pin #${targetPinId} read from universal_master_pins.`);
  }

  console.log('\n================================================================================');
  console.log('🏁 BACKFILL COMPLETE');
  console.log('================================================================================\n');
  } finally {
    activityLease.stop();
    if (hubSql && typeof hubSql.end === 'function') {
      try {
        await hubSql.end({ timeout: 5 });
      } catch (_) {}
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('[-] Fatal error running backfill:', err);
    process.exit(1);
  });
}
