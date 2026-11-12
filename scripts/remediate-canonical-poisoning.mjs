/**
 * Forensic Remediation Script: Canonical Pin Metric De-Poisoning & Authentic Velocity Recalculation
 *
 * Scans universal_master_pins, keyword_displaced_index, and keyword_serp_current for pins
 * that suffered from canonical hop save-stealing or velocity compounding, fetches authentic
 * metrics directly from Pinterest via unpolluted fetchPinFromPinResource in concurrent batches,
 * recalculates clean time-normalized daily save velocity against historical baseline snapshots,
 * heals all tables (including physical pins_daily_metrics), and clamps impossible historical saves.
 */

import postgres from 'postgres';
import { fetchPinHybrid, sleep } from './lib/pinterest.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is required.');
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { max: 20 });

async function remediate() {
  console.log('=== [FORENSIC REMEDIATION] Starting Canonical De-Poisoning & Velocity Healing ===\n');

  // 1. Identify all candidate pins across universal_master_pins and keyword_serp_current:
  // - Any pin with a distinct canonical_pin_id (regardless of current velocity, catching low-velocity poisoned pins)
  // - Any pin where save_count == repin_count > 0 (catching repin_count -> save_count conflation)
  // - Any pin with daily_save_velocity >= 20 or delta_saves_24h >= 20
  // - Any pin in keyword_serp_current where baseline_day_saves > save_count
  // - Explicit landmark pins reported by operator
  const candidatePins = await sql`
    SELECT DISTINCT pin_id
    FROM (
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
      UNION
      SELECT pin_id
      FROM keyword_serp_current
      WHERE (baseline_day_saves IS NOT NULL AND baseline_day_saves > save_count)
         OR (save_count > 0 AND save_count = repin_count)
    ) candidates
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
          SELECT save_count, repin_count, snapshot_date, daily_save_velocity
          FROM pins_daily_metrics
          WHERE pin_id = ${pinId}
            AND snapshot_date < ${todayStr}::date
          ORDER BY snapshot_date DESC
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

        // 2. Update keyword_displaced_index
        await sql`
          UPDATE keyword_displaced_index
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            comment_count = ${trueComments},
            share_count = ${trueShares},
            daily_save_velocity = ${trueVelocity},
            delta_saves_24h = ${deltaSaves24h},
            delta_repins_24h = ${deltaRepins24h},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 3. Update keyword_serp_current (including self-healing poisoned baseline_day_saves)
        await sql`
          UPDATE keyword_serp_current
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            baseline_day_saves = CASE
              WHEN baseline_day_saves IS NOT NULL AND baseline_day_saves > ${trueSaves}
              THEN ${trueSaves}
              ELSE baseline_day_saves
            END,
            comment_count = ${trueComments},
            share_count = ${trueShares},
            daily_save_velocity = ${trueVelocity},
            delta_repins_24h = ${deltaRepins24h},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 4. Update competitor_pins & pa_pins
        await sql`
          UPDATE competitor_pins
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            comment_count = ${trueComments},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        await sql`
          UPDATE pa_pins
          SET
            saves = ${trueSaves},
            repins = ${trueRepins},
            comments = ${trueComments},
            share_count = ${trueShares},
            velocity = ${trueVelocity},
            last_updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 5. Update today's snapshot in pins_daily_metrics (physical table, NOT view)
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
            AND snapshot_date = ${todayStr}::date;
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

  // 6. Global Table Sync to eliminate any discrepancies across all 4 pillars
  console.log('\n[Global Sync] Harmonizing keyword_serp_current, keyword_displaced_index, competitor_pins, and pa_pins with universal_master_pins...');
  const resKsc = await sql`
    UPDATE keyword_serp_current ksc
    SET
      save_count = ump.save_count,
      repin_count = ump.repin_count,
      baseline_day_saves = CASE
        WHEN ksc.baseline_day_saves IS NOT NULL AND ksc.baseline_day_saves > ump.save_count
        THEN ump.save_count
        ELSE ksc.baseline_day_saves
      END,
      daily_save_velocity = ump.daily_save_velocity
    FROM universal_master_pins ump
    WHERE ksc.pin_id = ump.pin_id
      AND (
        ksc.save_count <> ump.save_count
        OR ksc.repin_count <> ump.repin_count
        OR ksc.daily_save_velocity <> ump.daily_save_velocity
        OR (ksc.baseline_day_saves IS NOT NULL AND ksc.baseline_day_saves > ump.save_count)
      );
  `;
  console.log(`  Synchronized ${resKsc.count || 0} rows in keyword_serp_current.`);

  const resKdi = await sql`
    UPDATE keyword_displaced_index kdi
    SET
      save_count = ump.save_count,
      repin_count = ump.repin_count,
      daily_save_velocity = ump.daily_save_velocity,
      delta_repins_24h = COALESCE(ump.delta_repins_24h, 0)
    FROM universal_master_pins ump
    WHERE kdi.pin_id = ump.pin_id
      AND (
        kdi.save_count <> ump.save_count
        OR kdi.repin_count <> ump.repin_count
        OR kdi.daily_save_velocity <> ump.daily_save_velocity
      );
  `;
  console.log(`  Synchronized ${resKdi.count || 0} rows in keyword_displaced_index.`);

  const resCp = await sql`
    UPDATE competitor_pins cp
    SET
      save_count = ump.save_count,
      repin_count = ump.repin_count
    FROM universal_master_pins ump
    WHERE cp.pin_id = ump.pin_id
      AND (cp.save_count <> ump.save_count OR cp.repin_count <> ump.repin_count);
  `;
  console.log(`  Synchronized ${resCp.count || 0} rows in competitor_pins.`);

  const resPa = await sql`
    UPDATE pa_pins pa
    SET
      saves = ump.save_count,
      repins = ump.repin_count,
      velocity = ump.daily_save_velocity
    FROM universal_master_pins ump
    WHERE pa.pin_id = ump.pin_id
      AND (pa.saves <> ump.save_count OR pa.repins <> ump.repin_count OR pa.velocity <> ump.daily_save_velocity);
  `;
  console.log(`  Synchronized ${resPa.count || 0} rows in pa_pins.`);

  await sql.end();
}

remediate().catch(err => {
  console.error('Fatal remediation error:', err);
  process.exit(1);
});
