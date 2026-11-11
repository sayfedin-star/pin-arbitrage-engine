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
import { fetchPinFromPinResource, sleep } from './lib/pinterest.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';
const sql = postgres(DATABASE_URL, { max: 20 });

async function remediate() {
  console.log('=== [FORENSIC REMEDIATION] Starting Canonical De-Poisoning & Velocity Healing ===\n');

  // 1. Identify suspicious pins:
  // - canonical_pin_id != pin_id and (daily_save_velocity >= 20 or delta_saves_24h >= 20)
  // - OR daily_save_velocity >= 50
  // - OR delta_saves_24h >= 50
  // - OR explicit landmark pins reported by user
  const candidatePins = await sql`
    SELECT DISTINCT pin_id
    FROM universal_master_pins
    WHERE (
      (canonical_pin_id IS NOT NULL AND canonical_pin_id <> pin_id AND (daily_save_velocity >= 20 OR delta_saves_24h >= 20))
      OR daily_save_velocity >= 50
      OR delta_saves_24h >= 50
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
        // Fetch authentic pin metrics directly from Pinterest PinResource
        const fastRes = await fetchPinFromPinResource(pinId, null, true);
        if (!fastRes?.ok || !fastRes.pin) {
          skippedCount++;
          return;
        }

        const p = fastRes.pin;
        const trueSaves = Number(p.saves ?? 0);
        const trueRepins = Number(p.repins ?? 0);
        const trueComments = Number(p.comments ?? 0);
        const trueShares = Number(p.share_count ?? 0);
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
            deltaSaves24h = Math.max(0, trueSaves - baseSaves);
          } else {
            // If true saves is lower than prior baseline, prior baseline was poisoned!
            // Clamp any historical snapshot where save_count exceeds authentic true saves
            await sql`
              UPDATE pins_daily_metrics
              SET save_count = ${trueSaves}
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
            delta_repins_24h = ${deltaRepins24h},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 3. Update keyword_serp_current
        await sql`
          UPDATE keyword_serp_current
          SET
            save_count = ${trueSaves},
            repin_count = ${trueRepins},
            comment_count = ${trueComments},
            share_count = ${trueShares},
            daily_save_velocity = ${trueVelocity},
            delta_repins_24h = ${deltaRepins24h},
            updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 4. Update today's snapshot in pins_daily_metrics (physical table, NOT view)
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

  // 5. Global Table Sync to eliminate any discrepancies
  console.log('\n[Global Sync] Harmonizing keyword_serp_current and keyword_displaced_index with universal_master_pins...');
  const resKsc = await sql`
    UPDATE keyword_serp_current ksc
    SET
      save_count = ump.save_count,
      daily_save_velocity = ump.daily_save_velocity
    FROM universal_master_pins ump
    WHERE ksc.pin_id = ump.pin_id
      AND (ksc.save_count <> ump.save_count OR ksc.daily_save_velocity <> ump.daily_save_velocity);
  `;
  console.log(`  Synchronized ${resKsc.count || 0} rows in keyword_serp_current.`);

  const resKdi = await sql`
    UPDATE keyword_displaced_index kdi
    SET
      save_count = ump.save_count,
      daily_save_velocity = ump.daily_save_velocity
    FROM universal_master_pins ump
    WHERE kdi.pin_id = ump.pin_id
      AND (kdi.save_count <> ump.save_count OR kdi.daily_save_velocity <> ump.daily_save_velocity);
  `;
  console.log(`  Synchronized ${resKdi.count || 0} rows in keyword_displaced_index.`);

  await sql.end();
}

remediate().catch(err => {
  console.error('Fatal remediation error:', err);
  process.exit(1);
});
