import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('[*] Adding claim_token to competitor_pins...');
  await sql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS claim_token UUID;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_claim_token ON competitor_pins(claim_token) WHERE claim_token IS NOT NULL;`;
  console.log('[✓] Migration successful: claim_token column and index created.');
}

migrate().catch(err => {
  console.error('[-] Migration failed:', err);
  process.exit(1);
});
