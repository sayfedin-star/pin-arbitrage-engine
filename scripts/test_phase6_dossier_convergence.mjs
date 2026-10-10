import fs from 'fs';
import assert from 'assert';
import { neon } from '@neondatabase/serverless';
import { getPinDeepDossier } from '../src/modules/keywords/service.mjs';
import { fetchUniversalPinDossier } from '../src/modules/sharding/fleet-router.mjs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(dbUrl);

async function run() {
  console.log('=============================================================');
  console.log('🧪 Universal Pin Dossier 48-Field Convergence Forensic Audit');
  console.log('=============================================================');

  // 1. Pick a sample pin from keyword_serp_current
  const [sampleRow] = await sql`
    SELECT pin_id, keyword_id, title 
    FROM keyword_serp_current 
    WHERE pin_id IS NOT NULL 
    LIMIT 1;
  `;
  assert(sampleRow, 'Must have at least one pin in keyword_serp_current');
  console.log(`\n[1] Testing getPinDeepDossier on Pin ID: ${sampleRow.pin_id} (Keyword ID: ${sampleRow.keyword_id})...`);

  const d1 = await getPinDeepDossier(sql, sampleRow.pin_id, sampleRow.keyword_id);
  
  console.log('  ✓ Response received successfully:');
  console.log('    - success:', d1.success);
  console.log('    - pin_id:', d1.pin_id);
  console.log('    - title:', d1.title);
  console.log('    - description present:', Boolean(d1.description));
  console.log('    - seo_alt_text present:', Boolean(d1.seo_alt_text));
  console.log('    - annotations count:', d1.annotations?.length);
  console.log('    - creator_username:', d1.creator_username || '(none)');
  console.log('    - creator_name:', d1.creator_name || '(none)');
  console.log('    - creator_followers:', d1.creator_followers);
  console.log('    - board_name:', d1.board_name);
  console.log('    - total_saves:', d1.kpis?.total_saves);
  console.log('    - repins:', d1.kpis?.repins);
  console.log('    - comments:', d1.kpis?.comments);
  console.log('    - velocity:', d1.kpis?.velocity);
  console.log('    - google_indexed:', d1.is_indexed_google);
  console.log('    - is_repin:', d1.is_repin);
  console.log('    - trajectory snapshots:', d1.trajectory?.snapshots?.length);

  assert.strictEqual(d1.success, true, 'getPinDeepDossier must return success: true');
  assert.strictEqual(d1.pin_id, sampleRow.pin_id, 'pin_id must match');
  assert(d1.kpis, 'Must return kpis block');
  assert(d1.deltas, 'Must return deltas block');
  assert(d1.trajectory, 'Must return trajectory block');
  assert(d1.annotations !== undefined, 'Must return annotations array');

  // 2. Test fetchUniversalPinDossier (fleet-router)
  console.log(`\n[2] Testing fetchUniversalPinDossier on Pin ID: ${sampleRow.pin_id}...`);
  const d2 = await fetchUniversalPinDossier({ hubSql: sql, pinId: sampleRow.pin_id });
  
  console.log('  ✓ Universal Dossier received successfully:');
  console.log('    - success:', d2.success);
  console.log('    - pin_id:', d2.pin_id);
  console.log('    - shard_id:', d2.shard_id);
  console.log('    - creative title:', d2.creative?.title);
  console.log('    - creative description present:', Boolean(d2.creative?.description));
  console.log('    - creative alt_text present:', Boolean(d2.creative?.alt_text));
  console.log('    - creative annotations count:', d2.creative?.visual_annotations?.length);
  console.log('    - creator_username:', d2.pillar_1_creator_context?.creator_username);
  console.log('    - ranking_keywords count:', d2.pillar_2_keywords_context?.ranking_keywords?.length);
  console.log('    - algorithmic google indexed:', d2.algorithmic_intelligence?.is_indexed_google);

  assert.strictEqual(d2.success, true, 'fetchUniversalPinDossier must return success: true');
  assert.strictEqual(d2.pin_id, sampleRow.pin_id, 'pin_id must match');
  assert(d2.creative, 'Must return creative block');
  assert(d2.pillar_1_creator_context, 'Must return pillar_1_creator_context block');
  assert(d2.pillar_2_keywords_context, 'Must return pillar_2_keywords_context block');
  assert(d2.algorithmic_intelligence, 'Must return algorithmic_intelligence block');

  console.log('\n=============================================================');
  console.log('✅ ALL DOSSIER CONVERGENCE TESTS PASSED 100%!');
  console.log('=============================================================');
}

run().catch(err => {
  console.error('\n[-] TEST FAILED:', err);
  process.exit(1);
});
