/**
 * scripts/heal_repin_save_velocity_spikes.mjs
 * 
 * One-Time Database Healing Script
 * Heals repin-to-save hydration velocity artifacts across:
 * 1. keyword_serp_current
 * 2. keyword_displaced_index
 * 3. tracked_keywords (recalculated avg_daily_velocity)
 * 
 * Verifies that Pin #911134568440407967 (and related pins) in Folder #5 ('high protein')
 * reflect authentic 0/d 24h velocity (+496 7d gains) matching Pin Dossier.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { calculateFolderCrossover } from '../src/modules/keywords/folders-service.mjs';

const envPath = path.resolve('.env');
if (!fs.existsSync(envPath)) {
  console.error('.env file not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
let dbUrl = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    break;
  }
}

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(dbUrl);

async function healDatabase() {
  console.log('=== Step 1: Inspecting Target Pin Before Healing ===');
  const targetBefore = await sql`
    SELECT keyword_id, pin_id, title, save_count, repin_count, daily_save_velocity, baseline_day_saves, gains_7d
    FROM keyword_serp_current
    WHERE pin_id = '911134568440407967' OR (save_count = 19236 AND repin_count = 11665);
  `;
  console.log('Target pin before healing:', targetBefore);

  console.log('\n=== Step 2: Healing keyword_serp_current ===');
  const kscResult = await sql`
    UPDATE keyword_serp_current
    SET daily_save_velocity = 0,
        baseline_day_saves = save_count,
        updated_at = NOW()
    WHERE daily_save_velocity >= 100
      AND save_count > repin_count
      AND repin_count > 0
      AND (
        ABS((save_count - repin_count) - daily_save_velocity) <= GREATEST(50, repin_count * 0.03)
        OR ABS(baseline_day_saves - repin_count) <= GREATEST(50, repin_count * 0.03)
        OR (gains_7d IS NOT NULL AND gains_7d >= 0 AND daily_save_velocity > GREATEST(500, gains_7d * 2))
      )
    RETURNING pin_id, keyword_id, save_count, repin_count, daily_save_velocity;
  `;
  console.log(`Healed ${kscResult.length} rows in keyword_serp_current!`);
  if (kscResult.length > 0) {
    console.log('Sample healed rows in keyword_serp_current:', kscResult.slice(0, 5));
  }

  console.log('\n=== Step 3: Healing keyword_displaced_index ===');
  const kdiResult = await sql`
    UPDATE keyword_displaced_index
    SET daily_save_velocity = 0,
        updated_at = NOW()
    WHERE daily_save_velocity >= 100
      AND save_count > repin_count
      AND repin_count > 0
      AND (
        ABS((save_count - repin_count) - daily_save_velocity) <= GREATEST(50, repin_count * 0.03)
        OR (gains_7d IS NOT NULL AND gains_7d >= 0 AND daily_save_velocity > GREATEST(500, gains_7d * 2))
      )
    RETURNING pin_id, keyword_id, save_count, repin_count, daily_save_velocity;
  `;
  console.log(`Healed ${kdiResult.length} rows in keyword_displaced_index!`);
  if (kdiResult.length > 0) {
    console.log('Sample healed rows in keyword_displaced_index:', kdiResult.slice(0, 5));
  }

  console.log('\n=== Step 4: Recalculating tracked_keywords.avg_daily_velocity ===');
  const tkResult = await sql`
    WITH kw_vel AS (
      SELECT keyword_id, ROUND(AVG(daily_save_velocity)::numeric, 2) AS new_avg
      FROM keyword_serp_current
      WHERE is_displaced = FALSE
      GROUP BY keyword_id
    )
    UPDATE tracked_keywords tk
    SET avg_daily_velocity = kv.new_avg,
        updated_at = NOW()
    FROM kw_vel kv
    WHERE tk.id = kv.keyword_id
      AND tk.avg_daily_velocity IS DISTINCT FROM kv.new_avg
    RETURNING tk.id, tk.keyword, tk.avg_daily_velocity;
  `;
  console.log(`Updated avg_daily_velocity for ${tkResult.length} keywords.`);

  console.log('\n=== Step 5: Verifying Target Pin After Healing ===');
  const targetAfter = await sql`
    SELECT keyword_id, pin_id, title, save_count, repin_count, daily_save_velocity, baseline_day_saves, gains_7d
    FROM keyword_serp_current
    WHERE pin_id = '911134568440407967' OR (save_count = 19236 AND repin_count = 11665);
  `;
  console.log('Target pin after healing in DB:', targetAfter);

  console.log('\n=== Step 6: Verifying Folder #5 Crossover In-Memory & Telemetry ===');
  const crossover = await calculateFolderCrossover(sql, 5, { refresh: true });
  const crossoverPin = crossover.all_pins.find(p => p.pin_id === '911134568440407967' || (p.save_count === 19236 && p.repin_count === 11665));
  if (crossoverPin) {
    console.log('Folder #5 Crossover Pin Telemetry:', {
      pin_id: crossoverPin.pin_id,
      title: crossoverPin.title,
      save_count: crossoverPin.save_count,
      repin_count: crossoverPin.repin_count,
      daily_save_velocity: crossoverPin.daily_save_velocity,
      delta_saves_24h: crossoverPin.delta_saves_24h,
      gains_7d: crossoverPin.gains_7d,
      rankings: crossoverPin.rankings
    });
  } else {
    console.log('Pin not found in Folder 5 crossover!');
  }

  console.log('\n🎉 Database healing and verification complete!');
}

healDatabase().catch(err => {
  console.error('Healing failed:', err);
  process.exit(1);
});
