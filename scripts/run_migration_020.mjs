import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  console.log('[*] Running Migration 020: keyword_ignored_pins on Neon Hub...');
  
  await sql`
    CREATE TABLE IF NOT EXISTS keyword_ignored_pins (
      keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      pin_id VARCHAR(64) NOT NULL,
      ignored_reason TEXT DEFAULT 'manual_user_deletion',
      ignored_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (keyword_id, pin_id)
    );
  `;
  console.log('[+] Table keyword_ignored_pins created/verified.');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kip_keyword_pin ON keyword_ignored_pins(keyword_id, pin_id);
  `;
  console.log('[+] Index idx_kip_keyword_pin created/verified.');

  const check = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name = 'keyword_ignored_pins';
  `;
  console.log('[+] Verification: Table exists:', check);
}

run().catch(err => {
  console.error('[-] Migration 020 failed:', err);
  process.exit(1);
});
