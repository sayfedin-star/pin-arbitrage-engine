import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const sql = neon(process.env.DATABASE_URL);

async function verifyGate1() {
  console.log('=== VERIFICATION GATE 1 AUDIT ===');
  const dupes = await sql`
    SELECT canonical_keyword, count(*) 
    FROM tracked_keywords 
    GROUP BY canonical_keyword 
    HAVING count(*) > 1;
  `;
  console.log(`Duplicate Canonical Keywords Count: ${dupes.length}`);
  
  const idx = await sql`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'tracked_keywords' 
      AND indexname = 'uq_canonical_tracked_keywords';
  `;
  console.log(`Unique Index Status: ${idx.length > 0 ? idx[0].indexname + ' (EXISTS)' : 'NOT FOUND'}`);

  const sampleCols = await sql`
    SELECT column_name, data_type, is_generated 
    FROM information_schema.columns 
    WHERE table_name = 'tracked_keywords' AND column_name = 'canonical_keyword';
  `;
  console.log(`Generated Column Status:`, sampleCols);

  if (dupes.length === 0 && idx.length > 0) {
    console.log('🟢 VERIFICATION GATE 1: PASSED (100% CLEAN)');
    process.exitCode = 0;
  } else {
    console.error('🔴 VERIFICATION GATE 1: FAILED');
    process.exitCode = 1;
  }
}

verifyGate1().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
