import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const hubSql = neon(process.env.DATABASE_URL);

async function migrateFleet() {
  console.log('[*] Starting Neon Fleet Schema Migration across all registered projects...');
  const registry = await hubSql`
    SELECT id, project_id, project_name, is_hub, database_url
    FROM neon_projects_registry
    WHERE status = 'active' AND database_url IS NOT NULL
    ORDER BY is_hub DESC, id ASC;
  `;

  console.log(`[*] Found ${registry.length} active projects in registry.`);

  let succeeded = 0;
  let failed = 0;

  // Process in concurrent batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (proj) => {
      try {
        const sSql = proj.is_hub ? hubSql : neon(proj.database_url);

        // 1. Column additions
        await sSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;`;
        await sSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`;
        await sSql`ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`;

        // 2. Indexes
        await sSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_is_product ON competitor_pins(competitor_id, is_product) WHERE is_product = TRUE;`;
        await sSql`CREATE INDEX IF NOT EXISTS idx_pa_pins_is_product ON pa_pins(is_product) WHERE is_product = TRUE;`;
        await sSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_board ON competitor_pins(competitor_id, board_name);`;

        // 3. Backfill is_product
        await sSql`
          UPDATE competitor_pins
          SET is_product = TRUE
          WHERE (is_product IS NULL OR is_product = FALSE) AND (
            link_domain ILIKE '%etsy%' OR 
            link_domain ILIKE '%shopify%' OR 
            link_domain ILIKE '%amazon%' OR 
            destination_url ILIKE '%/listing/%' OR 
            destination_url ILIKE '%/product/%' OR 
            destination_url ILIKE '%/item/%' OR 
            destination_url ILIKE '%gumroad.com%'
          );
        `;

        succeeded++;
      } catch (err) {
        console.warn(`[-] Migration failed for ${proj.project_name} (${proj.project_id}):`, err.message);
        failed++;
      }
    }));
    console.log(`    Progress: ${Math.min(i + BATCH_SIZE, registry.length)}/${registry.length} projects processed.`);
  }

  console.log(`\n[✓] Fleet Migration Completed! Succeeded: ${succeeded}, Failed: ${failed}`);
}

migrateFleet().catch(console.error);
