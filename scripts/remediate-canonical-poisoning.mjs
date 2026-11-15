/**
 * Forensic Remediation Script: Canonical Pin Metric De-Poisoning & Authentic Velocity Recalculation
 *
 * Scans universal_master_pins for pins
 * that suffered from canonical hop save-stealing or velocity compounding, fetches authentic
 * metrics directly from Pinterest via unpolluted fetchPinFromPinResource in concurrent batches,
 * recalculates clean time-normalized daily save velocity against historical baseline snapshots,
 * and heals universal_master_pins and pins_daily_metrics.
 */

import { createSqlClient } from '../src/db/client.mjs';
import { fetchPinHybrid, sleep } from './lib/pinterest.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error('[-] FATAL: process.env.DATABASE_URL is required (hardcoded fallback credentials removed).');
  process.exit(1);
}
const sql = createSqlClient(DATABASE_URL, { max: 20 });

async function remediate() {
  try {
  console.log('=== [FORENSIC REMEDIATION] Starting Canonical De-Poisoning & Velocity Healing ===\n');

  // 1. Identify all candidate pins across universal_master_pins:
  // - Any pin with a distinct canonical_pin_id (regardless of current velocity, catching low-velocity poisoned pins)
  // - Any pin where save_count == repin_count > 0 (catching repin_count -> save_count conflation)
  // - Any pin with daily_save_velocity >= 20 or delta_saves_24h >= 20
  // - Explicit landmark pins reported by operator
  const candidatePins = await sql`
    SELECT pin_id
    FROM universal_master_pins
    WHERE (
      (canonical_pin_id IS NOT NULL AND canonical_pin_id <> '' AND canonical_pin_id <> pin_id)
      OR (save_count > 0 AND save_count = repin_count)
      OR daily_save_velocity >= 20
      OR delta_saves_24h >= 20
      OR pin_id IN (
        '348888302405814587', '1130966525258943811', '1152288254700579018',
        '903112531589721411', '1083608360376709865', '503277327134077011',
        '4598949345276753984', '1145040274134461975', '4600215988456425536',
        '1125829606883665959', '1134907174848332604', '307018899618535309'
      )
    )
    ORDER BY pin_id;
  `;

  console.log(`[Remediation] Found ${candidatePins.length} candidate pins to inspect and heal.\n`);

  let healedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const BATCH_SIZE = 12;

  for (let i = 0; i < candidatePins.length; i += BATCH_SIZE) {
    const chunk = candidatePins.slice(i, i + BATCH_SIZE);

    await Promise.all(chunk.map(async ({ pin_id: pinId }) => {
      try {
        // Fetch authentic pin metrics via fetchPinHybrid (PinResource + SSR fallback if aggregated_pin_data is omitted)
        const p = await fetchPinHybrid(pinId, { isTelemetryOnly: true });
        if (!p || (!p.has_explicit_saves && Number(p.saves ?? 0) === 0 && Number(p.repins ?? 0) > 0)) {
          skippedCount++;
          return;
        }

        const trueSaves = Math.max(0, Number(p.saves ?? 0));
        const trueRepins = Math.max(0, Number(p.repins ?? 0));
        const trueComments = Math.max(0, Number(p.comments ?? 0));
        const trueShares = Math.max(0, Number(p.share_count ?? p.shares ?? 0));
        const totalReactions = (typeof p.reactions === 'object' && p.reactions !== null)
          ? Object.values(p.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
          : Number(p.reactions || 0);

        // Find authentic prior baseline snapshot from physical table pins_daily_metrics
        const [priorSnap] = await sql`
          SELECT save_count, repin_count, recorded_date AS snapshot_date, daily_save_velocity
          FROM pins_daily_metrics
          WHERE pin_id = ${pinId}
            AND recorded_date < ${todayStr}::date
          ORDER BY recorded_date DESC
          LIMIT 1;
        `;

        let trueVelocity = 0;
        let deltaSaves24h = 0;
        let deltaRepins24h = 0;

        if (priorSnap) {
          const baseSaves = Number(priorSnap.save_count || 0);
          const baseRepins = Number(priorSnap.repin_count || 0);
          const baseDate = priorSnap.snapshot_date;

          if (trueSaves >= baseSaves) {
            trueVelocity = calculateDailyVelocity({
              currentSaves: trueSaves,
              baselineSaves: baseSaves,
              currentRepins: trueRepins,
              baselineRepins: baseRepins,
              currentDate: new Date(),
              baselineDate: baseDate,
              createdAt: p.created_at_pinterest || null,
              wasDeepHydrated: baseSaves >= 10,
              maxCap: 25000
            });
            deltaSaves24h = Math.round(trueVelocity);
          } else {
            // If true saves is lower than prior baseline, prior baseline was poisoned!
            // Clamp any historical snapshot where save_count exceeds authentic true saves and reset its poisoned velocity
            await sql`
              UPDATE pins_daily_metrics
              SET save_count = ${trueSaves},
                  daily_save_velocity = 0
              WHERE pin_id = ${pinId}
                AND save_count > ${trueSaves};
            `;
            deltaSaves24h = 0;
            trueVelocity = 0;
          }

          deltaRepins24h = Math.max(0, trueRepins - baseRepins);
        } else {
          deltaSaves24h = 0;
          deltaRepins24h = 0;
          trueVelocity = 0;
        }

        // 1. Update universal_master_pins
        await sql`
          UPDATE universal_master_pins
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            comment_count = ${trueComments},
            share_count = ${trueShares},
            reaction_count = ${totalReactions},
            daily_save_velocity = ${trueVelocity},
            delta_saves_24h = ${deltaSaves24h},
            delta_repins_24h = ${deltaRepins24h},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 2. Update today's snapshot in pins_daily_metrics
        await sql`
          UPDATE pins_daily_metrics
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            comment_count = ${trueComments},
            share_count = ${trueShares},
            reaction_count = ${totalReactions},
            daily_save_velocity = ${trueVelocity},
            updated_at = NOW()
          WHERE pin_id = ${pinId}
            AND recorded_date = ${todayStr}::date;
        `;

        healedCount++;
        if (pinId === '348888302405814587' || pinId === '1130966525258943811' || pinId === '1152288254700579018' || pinId === '4598949345276753984') {
          console.log(`  [✓] Priority Healed Pin #${pinId}: saves=${trueSaves}, repins=${trueRepins}, velocity=${trueVelocity}/d, delta24h=${deltaSaves24h}`);
        }
      } catch (err) {
        failedCount++;
        console.warn(`  [!] Error healing Pin #${pinId}:`, err.message);
      }
    }));

    if ((i + BATCH_SIZE) % 60 === 0 || i + BATCH_SIZE >= candidatePins.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, candidatePins.length)} / ${candidatePins.length} (Healed: ${healedCount})`);
    }

    // Small delay between batches to respect rate limits
    await sleep(80);
  }

  console.log(`\n=== Live Pinterest De-Poisoning Complete ===`);
  console.log(`  Healed: ${healedCount} pins`);
  console.log(`  Skipped: ${skippedCount} pins`);
  console.log(`  Failed: ${failedCount} pins`);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

remediate().catch(err => {
  console.error('Fatal remediation error:', err);
  process.exit(1);
});
