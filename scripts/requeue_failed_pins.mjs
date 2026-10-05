import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sql = neon(process.env.DATABASE_URL);

async function requeueAuthenticPins() {
  console.log('[*] Finding falsely failed authentic pins...');
  const rows = await sql`
    SELECT id, pin_id, competitor_id, enrich_attempts, enrichment_status
    FROM competitor_pins
    WHERE enrichment_status = 'failed'
      AND pin_id NOT LIKE '-%'
      AND pin_id NOT LIKE 'cb-%';
  `;
  console.log(`Found ${rows.length} authentic pins marked as 'failed':`);
  console.log(rows.map(r => ({ id: r.id, pin_id: r.pin_id, competitor_id: r.competitor_id })));

  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const updated = await sql`
      UPDATE competitor_pins
      SET enrichment_status = 'pending',
          enrich_attempts = 0,
          claim_token = NULL,
          updated_at = NOW()
      WHERE id = ANY(${ids})
      RETURNING id;
    `;
    console.log(`[✓] Successfully re-queued ${updated.length} pins to 'pending'!`);
  }
}

requeueAuthenticPins().catch(console.error);
