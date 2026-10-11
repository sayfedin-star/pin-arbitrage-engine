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
  console.log('[*] Running Migration 021: Keyword Depth & App Settings on Neon Hub...');

  // 1. Create app_settings table
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(128) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  console.log('[+] Table app_settings created/verified.');

  // 2. Seed default keyword crawl settings
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (
      'keyword_crawl_settings',
      '{
        "default_crawl_pages": 10,
        "default_max_pins": 250,
        "default_inspection_mode": "smart_breakout",
        "breakout_rules": {
          "max_pin_age_days": 14,
          "min_daily_save_velocity": 3.0,
          "min_repins": 1,
          "target_rank_zone": [20, 400]
        }
      }'::jsonb,
      NOW()
    )
    ON CONFLICT (key) DO NOTHING;
  `;
  console.log('[+] Default app_settings seeded.');

  // 3. Enhance tracked_keywords
  await sql`
    ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_pages_limit INT DEFAULT 10;
  `;
  await sql`
    ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS inspection_mode VARCHAR(64) DEFAULT 'smart_breakout';
  `;
  console.log('[+] Columns crawl_pages_limit & inspection_mode added to tracked_keywords.');

  // 4. Backfill existing rows
  await sql`
    UPDATE tracked_keywords 
    SET crawl_pages_limit = 10 
    WHERE crawl_pages_limit IS NULL;
  `;
  await sql`
    UPDATE tracked_keywords 
    SET inspection_mode = 'smart_breakout' 
    WHERE inspection_mode IS NULL OR inspection_mode = '';
  `;
  const updateRes = await sql`
    UPDATE tracked_keywords 
    SET target_pin_count = 250 
    WHERE target_pin_count <= 100;
  `;
  console.log(`[+] Backfilled existing keywords (target_pin_count elevated to 250 on ${updateRes.length || 'all'} rows).`);

  // 5. Verification
  const settingsRow = await sql`SELECT * FROM app_settings WHERE key = 'keyword_crawl_settings';`;
  console.log('[+] Verification app_settings:', JSON.stringify(settingsRow, null, 2));

  const sampleKw = await sql`SELECT id, keyword, target_pin_count, crawl_pages_limit, inspection_mode FROM tracked_keywords LIMIT 3;`;
  console.log('[+] Verification tracked_keywords sample:', JSON.stringify(sampleKw, null, 2));

  console.log('✅ Migration 021 completed successfully!');
}

run().catch(err => {
  console.error('[-] Migration 021 failed:', err);
  process.exit(1);
});
