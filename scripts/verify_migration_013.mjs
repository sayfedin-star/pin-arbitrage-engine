import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

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
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('=== VERIFYING MIGRATION 013 ON NEON DB ===');
  
  const displacedCols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'keyword_displaced_pins' 
    ORDER BY ordinal_position;
  `;
  console.log(`[+] keyword_displaced_pins column count: ${displacedCols.length}`);
  for (const c of displacedCols) {
    console.log(`    - ${c.column_name}: ${c.data_type}`);
  }

  const kpsCols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'keyword_pins_snapshots' 
      AND column_name IN ('is_displaced', 'share_count', 'reaction_count');
  `;
  console.log(`[+] keyword_pins_snapshots upgraded columns: ${kpsCols.length}`);
  for (const c of kpsCols) {
    console.log(`    - ${c.column_name}: ${c.data_type}`);
  }

  const indexes = await sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename IN ('keyword_displaced_pins', 'keyword_pins_snapshots')
      AND indexname LIKE '%kdp%' OR indexname LIKE '%kps%';
  `;
  console.log(`[+] New indexes active: ${indexes.length}`);
  for (const idx of indexes) {
    console.log(`    - ${idx.indexname}`);
  }

  const tkPopular = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'tracked_keywords' AND column_name = 'popular_pins';
  `;
  console.log(`[+] tracked_keywords popular_pins exists: ${tkPopular.length > 0}`);
}

main().catch(err => {
  console.error('[-] Verification error:', err);
  process.exit(1);
});
