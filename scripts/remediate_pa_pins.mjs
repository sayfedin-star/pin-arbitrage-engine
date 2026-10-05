import { neon } from '@neondatabase/serverless';
import { fetchPinFromPinterest } from './lib/pinterest.mjs';

const sql = neon(process.env.DATABASE_URL);

async function remediatePaPins() {
  console.log('=== Checking pa_pins for zero-save anomaly ===');
  
  const zeroSaves = await sql`
    SELECT pin_id, title, saves, repins, link
    FROM pa_pins
    WHERE saves = 0 OR saves IS NULL
    LIMIT 200;
  `;
  console.log(`Found ${zeroSaves.length} pins in pa_pins with 0 or NULL saves.`);

  let updatedCount = 0;
  for (const row of zeroSaves) {
    try {
      // First check if competitor_pins already has authentic non-zero saves
      const [compPin] = await sql`
        SELECT save_count, repin_count, comment_count 
        FROM competitor_pins 
        WHERE pin_id = ${row.pin_id} AND save_count > 0;
      `;
      if (compPin && Number(compPin.save_count) > 0) {
        await sql`
          UPDATE pa_pins
          SET 
            saves = ${compPin.save_count},
            repins = ${compPin.repin_count || compPin.save_count},
            comments = ${compPin.comment_count || 0},
            last_updated_at = NOW()
          WHERE pin_id = ${row.pin_id};
        `;
        console.log(`[+] Restored Pin ${row.pin_id} from competitor_pins: saves -> ${compPin.save_count}`);
        updatedCount++;
        continue;
      }

      // Fetch pin details anonymously (no cookies!)
      const res = await fetchPinFromPinterest(row.pin_id);
      const pinData = res?.pin;
      if (pinData && pinData.saves > 0) {
        await sql`
          UPDATE pa_pins
          SET 
            saves = ${pinData.saves},
            repins = ${pinData.repins || pinData.saves},
            comments = ${pinData.comments || 0},
            last_updated_at = NOW()
          WHERE pin_id = ${row.pin_id};
        `;
        console.log(`[+] Corrected Pin ${row.pin_id} via Anonymous SSR: saves -> ${pinData.saves}`);
        updatedCount++;
      }
    } catch (err) {
      console.warn(`[-] Failed to refresh pin ${row.pin_id}:`, err.message);
    }
  }

  console.log(`=== Finished: Updated ${updatedCount} pins in pa_pins ===`);
}

remediatePaPins().catch(console.error);
