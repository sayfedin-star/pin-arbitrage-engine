import assert from 'node:assert';
import { neon } from '@neondatabase/serverless';
import { fetchUniversalPinDossier, fetchPinTrajectoryFromShard } from '../src/modules/sharding/fleet-router.mjs';
import { getKeywordSERPComparison, getKeywordDisplacedPins, listKeywords } from '../src/modules/keywords/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('================================================================================');
  console.log('🧪 VERIFYING ANOMALY A & ANOMALY B REMEDIATION');
  console.log('================================================================================');

  // 1. Verify Pin #640637115793608522
  console.log('\n[*] Verifying Pin #640637115793608522 (Shard 62)...');
  const d1 = await fetchUniversalPinDossier({ hubSql: sql, pinId: '640637115793608522' });
  assert.strictEqual(d1.success, true, 'Dossier must return success: true');
  assert(d1.daily_trajectory.length >= 2, `Expected at least 2 trajectory points, got ${d1.daily_trajectory.length}`);
  const topPoint1 = d1.daily_trajectory[0];
  assert.strictEqual(topPoint1.snapshot_date, '2026-10-21', 'Top snapshot must be 2026-10-21');
  assert.strictEqual(topPoint1.save_count, 340, 'Top snapshot save_count must be 340');
  assert(Boolean(topPoint1.crawled_at), 'Top snapshot must contain crawled_at');
  assert(topPoint1.crawled_at.includes('2026-10-21T21:05:28'), `crawled_at must contain crawl timestamp: ${topPoint1.crawled_at}`);
  console.log(`  ✓ [PASS] Pin #640637115793608522: ${d1.daily_trajectory.length} trajectory points, saves: ${topPoint1.save_count}, crawled_at: ${topPoint1.crawled_at}`);

  // 2. Verify Pin #595108538308392665
  console.log('\n[*] Verifying Pin #595108538308392665 (Shard 60)...');
  const d2 = await fetchUniversalPinDossier({ hubSql: sql, pinId: '595108538308392665' });
  assert.strictEqual(d2.success, true, 'Dossier must return success: true');
  assert(d2.daily_trajectory.length >= 6, `Expected at least 6 trajectory points, got ${d2.daily_trajectory.length}`);
  const topPoint2 = d2.daily_trajectory[0];
  assert.strictEqual(topPoint2.snapshot_date, '2026-10-21', 'Top snapshot must be 2026-10-21');
  assert.strictEqual(topPoint2.save_count, 417, 'Top snapshot save_count must be 417');
  assert(Boolean(topPoint2.crawled_at), 'Top snapshot must contain crawled_at');
  assert(topPoint2.crawled_at.includes('2026-10-21T21:05:29'), `crawled_at must contain crawl timestamp: ${topPoint2.crawled_at}`);
  console.log(`  ✓ [PASS] Pin #595108538308392665: ${d2.daily_trajectory.length} trajectory points, saves: ${topPoint2.save_count}, crawled_at: ${topPoint2.crawled_at}`);

  // 3. Verify Shard trajectory query timestamp preservation
  console.log('\n[*] Verifying fetchPinTrajectoryFromShard timestamp preservation...');
  const shardTraj = await fetchPinTrajectoryFromShard({ hubSql: sql, pinId: '595108538308392665' });
  assert.strictEqual(shardTraj.success, true);
  assert(shardTraj.trajectory.length > 0);
  assert(shardTraj.trajectory[shardTraj.trajectory.length - 1].updated_at !== undefined, 'Shard trajectory must include updated_at');
  assert(shardTraj.trajectory[shardTraj.trajectory.length - 1].crawled_at !== undefined, 'Shard trajectory must include crawled_at');
  console.log(`  ✓ [PASS] fetchPinTrajectoryFromShard: ${shardTraj.trajectory.length} snapshots with valid crawled_at & updated_at`);

  // 4. Verify Keyword "Dinner Ideas" (ID 302) Parity
  console.log('\n[*] Verifying Keyword "Dinner Ideas" (ID 302) Dashboard & Studio Parity...');
  const kwList = await listKeywords(sql, { search: 'dinner ideas' });
  const listArr = Array.isArray(kwList) ? kwList : (kwList.keywords || []);
  const kw = listArr.find(k => k.id === 302);
  assert(Boolean(kw), 'Keyword 302 must exist in tracked_keywords');

  const comp = await getKeywordSERPComparison(sql, 302);
  assert.strictEqual(comp.total_displaced_count, kw.displaced_pins_count, `Comparison total_displaced_count (${comp.total_displaced_count}) must match listKeywords displaced_pins_count (${kw.displaced_pins_count})`);
  assert.strictEqual(comp.total_catalog_pins_count, kw.total_pins_count, `Comparison total_catalog_pins_count (${comp.total_catalog_pins_count}) must match listKeywords total_pins_count (${kw.total_pins_count})`);
  console.log(`  ✓ [PASS] Keyword 302 Parity: Active=${comp.current_pins.length}, Vault=${comp.total_displaced_count}, Total Catalog=${comp.total_catalog_pins_count}`);

  // 5. Verify Displaced Pins Pagination
  console.log('\n[*] Verifying Displaced Pins Pagination (24 per page)...');
  const page1 = await getKeywordDisplacedPins(sql, 302, { limit: 24, offset: 0 });
  assert.strictEqual(page1.pins.length, 24, `Page 1 must contain 24 pins, got ${page1.pins.length}`);
  assert.strictEqual(page1.total, kw.displaced_pins_count, `Total count must match ${kw.displaced_pins_count}`);

  const page2 = await getKeywordDisplacedPins(sql, 302, { limit: 24, offset: 24 });
  assert.strictEqual(page2.pins.length, 24, `Page 2 must contain 24 pins, got ${page2.pins.length}`);
  const page1Ids = new Set(page1.pins.map(p => p.pin_id));
  const hasOverlap = page2.pins.some(p => page1Ids.has(p.pin_id));
  assert.strictEqual(hasOverlap, false, 'Page 1 and Page 2 displaced pins must not overlap');
  console.log(`  ✓ [PASS] Displaced Pagination: Page 1 (24) and Page 2 (24) distinct, total ${page1.total}`);

  console.log('\n================================================================================');
  console.log('✅ ALL REMEDIATION & PARITY VERIFICATIONS PASSED (100% GREEN)!');
  console.log('================================================================================\n');
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
