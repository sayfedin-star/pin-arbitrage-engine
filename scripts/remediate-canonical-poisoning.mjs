/**
 * Forensic Remediation Script: Canonical Pin Metric De-Poisoning & Authentic Velocity Recalculation
 *
 * Scans universal_master_pins, keyword_displaced_index, and keyword_serp_current for pins
 * that suffered from canonical hop save-stealing or velocity compounding, fetches authentic
 * metrics directly from Pinterest via unpolluted fetchPinFromPinResource, recalculates clean
 * time-normalized daily save velocity against historical baseline snapshots, and heals all tables.
 */

import postgres from 'postgres';
import { fetchPinFromPinResource, sleep } from './lib/pinterest.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';
const sql = postgres(DATABASE_URL, { max: 10 });

async function remediate() {
  console.log('=== [FORENSIC REMEDIATION] Starting Canonical De-Poisoning & Velocity Healing ===\n');

  // 1. Identify suspicious pins:
  // - canonical_pin_id != pin_id and (daily_save_velocity >= 50 or save_count >= 500)
  // - OR daily_save_velocity >= 500
  // - OR delta_saves_24h >= 500
  const candidatePins = await sql`
    SELECT DISTINCT pin_id
    FROM universal_master_pins
    WHERE (
      (canonical_pin_id IS NOT NULL AND canonical_pin_id <> pin_id AND (daily_save_velocity >= 20 OR save_count >= 500))
      OR daily_save_velocity >= 100
      OR delta_saves_24h >= 100
      OR pin_id IN ('348888302405814587', '1130966525258943811', '1152288254700579018', '903112531589721411', '1083608360376709865', '503277327134077011')
    )
    ORDER BY pin_id;
  `;

  console.log(`[Remediation] Found ${candidatePins.length} candidate pins to inspect and heal.\n`);

  let healedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < candidatePins.length; i++) {
    const { pin_id: pinId } = candidatePins[i];

    try {
      // Fetch authentic pin metrics directly from Pinterest
      const fastRes = await fetchPinFromPinResource(pinId, null, true);
      if (!fastRes?.ok || !fastRes.pin) {
        skippedCount++;
        continue;
      }

      const p = fastRes.pin;
      const trueSaves = Number(p.saves ?? 0);
      const trueRepins = Number(p.repins ?? 0);
      const trueComments = Number(p.comments ?? 0);
      const trueShares = Number(p.share_count ?? 0);
      const totalReactions = (typeof p.reactions === 'object' && p.reactions !== null)
        ? Object.values(p.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
        : Number(p.reactions || 0);

      // Find authentic prior baseline snapshot (before today)
      const [priorSnap] = await sql`
        SELECT save_count, repin_count, snapshot_date, daily_save_velocity
        FROM pins_daily_snapshots
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
          // If true saves is lower than prior poisoned baseline, prior baseline was poisoned!
          // Find earliest unpoisoned snapshot or fallback to age-based velocity
          trueVelocity = calculateDailyVelocity({
            currentSaves: trueSaves,
            baselineSaves: 0,
            currentRepins: trueRepins,
            baselineRepins: 0,
            currentDate: new Date(),
            baselineDate: new Date(Date.now() - 86400000),
            createdAt: p.created_at_pinterest || null,
            wasDeepHydrated: false,
            maxCap: 25000
          });
          deltaSaves24h = 0;
        }

        deltaRepins24h = Math.max(0, trueRepins - baseRepins);
      } else {
        // No prior baseline
        deltaSaves24h = 0;
        deltaRepins24h = 0;
        trueVelocity = 0;
      }

      // Update universal_master_pins
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

      // Update keyword_displaced_index
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

      // Update keyword_serp_current
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

      // Update today's snapshot in pins_daily_snapshots
      await sql`
        UPDATE pins_daily_snapshots
        SET
          save_count = ${trueSaves},
          repin_count = ${trueRepins},
          comment_count = ${trueComments},
          share_count = ${trueShares},
          reaction_count = ${totalReactions},
          daily_save_velocity = ${trueVelocity}
        WHERE pin_id = ${pinId}
          AND snapshot_date = ${todayStr}::date;
      `;

      healedCount++;
      if (healedCount % 50 === 0 || pinId === '348888302405814587' || pinId === '1130966525258943811' || pinId === '1152288254700579018') {
        console.log(`  [✓] Healed Pin #${pinId}: saves=${trueSaves}, repins=${trueRepins}, velocity=${trueVelocity}/d, delta24h=${deltaSaves24h} (Progress: ${i + 1}/${candidatePins.length})`);
      }

      // Small jitter sleep to avoid rate limits
      if (i % 20 === 0 && i > 0) {
        await sleep(200);
      }
    } catch (err) {
      failedCount++;
      console.warn(`  [!] Error healing Pin #${pinId}:`, err.message);
    }
  }

  console.log(`\n=== Remediation Complete ===`);
  console.log(`  Healed: ${healedCount} pins`);
  console.log(`  Skipped: ${skippedCount} pins`);
  console.log(`  Failed: ${failedCount} pins`);

  await sql.end();
}

remediate().catch(err => {
  console.error('Fatal remediation error:', err);
  process.exit(1);
});
