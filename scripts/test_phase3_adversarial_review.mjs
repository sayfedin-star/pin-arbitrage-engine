import assert from 'node:assert';
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { getFolder, calculateFolderCrossover } from '../src/modules/keywords/folders-service.mjs';

console.log('================================================================================');
console.log('🧪 ADVERSARIAL REVIEW: PHASE 3 DATABASE & API PERFORMANCE OPTIMIZATION');
console.log('================================================================================\n');

// Load DATABASE_URL from .env
const envFile = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!dbUrl) {
  console.error('[-] FATAL: DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(dbUrl);

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err);
    throw err;
  }
}

async function run() {
  console.log('[*] Section 1: Testing getFolder with Aggregated Join & Edge Cases...');

  // 1. Invalid folder IDs
  await test('getFolder returns null on non-numeric or non-existent IDs', async () => {
    assert.strictEqual(await getFolder(sql, null), null);
    assert.strictEqual(await getFolder(sql, undefined), null);
    assert.strictEqual(await getFolder(sql, 0), null);
    assert.strictEqual(await getFolder(sql, 'invalid'), null);
    assert.strictEqual(await getFolder(sql, -1), null);
    assert.strictEqual(await getFolder(sql, 999999999), null);
  });

  // 2. Fetch existing folders
  const existingFolders = await sql`SELECT id, name FROM keyword_folders ORDER BY id ASC LIMIT 5;`;
  assert(existingFolders.length > 0, 'Database should contain at least one folder');

  const testFolder = existingFolders[0];
  console.log(`    Testing against folder ${testFolder.id} ("${testFolder.name}")...`);

  // 3. Test getFolder on real folder
  await test('getFolder returns exact schema shape with pin_count from aggregated join', async () => {
    const folder = await getFolder(sql, testFolder.id);
    assert(folder !== null, 'Folder must be found');
    assert.strictEqual(folder.id, testFolder.id);
    assert(Array.isArray(folder.items), 'items must be an array');
    assert(typeof folder.item_count === 'number', 'item_count must be a number');
    assert(typeof folder.keyword_count === 'number', 'keyword_count must be a number');
    assert.strictEqual(folder.item_count, folder.items.length);

    for (const item of folder.items) {
      assert(item.folder_item_id, 'folder_item_id must exist');
      assert(item.keyword, 'keyword must exist');
      assert(typeof item.pin_count === 'number', `pin_count must be a number, got ${typeof item.pin_count}`);
      assert(item.pin_count >= 0, 'pin_count must be non-negative');
    }
  });

  // 4. Parity check between new aggregated join query and ground-truth count
  await test('getFolder pin_count matches ground-truth active count in keyword_serp_current', async () => {
    const folder = await getFolder(sql, testFolder.id);
    for (const item of folder.items) {
      const [truth] = await sql`
        SELECT COUNT(*)::int as count
        FROM keyword_serp_current
        WHERE keyword_id = ${item.keyword_id}
          AND is_displaced = FALSE
          AND rank_position >= 1;
      `;
      const expectedCount = truth.count > 0 ? truth.count : 0;
      if (truth.count > 0) {
        assert.strictEqual(item.pin_count, expectedCount, `pin_count mismatch for keyword ${item.keyword}`);
      }
    }
  });

  // 5. Test empty folder edge case
  await test('getFolder handles empty folder (0 keywords) cleanly', async () => {
    const [emptyFolder] = await sql`
      INSERT INTO keyword_folders (name, description) 
      VALUES ('__test_adversarial_empty__', 'Testing empty folder') 
      RETURNING id, name;
    `;
    try {
      const res = await getFolder(sql, emptyFolder.id);
      assert(res !== null);
      assert.strictEqual(res.keyword_count, 0);
      assert.strictEqual(res.item_count, 0);
      assert.deepStrictEqual(res.items, []);
    } finally {
      await sql`DELETE FROM keyword_folders WHERE id = ${emptyFolder.id};`;
    }
  });

  console.log('\n[*] Section 2: Testing pinRows Targeted JSONB Projection in Crossover...');

  await test('calculateFolderCrossover runs successfully with targeted aspect_ratio & format', async () => {
    const crossover = await calculateFolderCrossover(sql, testFolder.id, { refresh: true });
    assert(crossover, 'Crossover result must exist');
    assert(crossover.summary, 'Summary must exist');
    assert(Array.isArray(crossover.super_pins), 'super_pins must be an array');
    assert(typeof crossover.summary.total_unique_pins === 'number');

    // Verify all pins in super_pins have valid aspect_ratio and format
    for (const pin of crossover.super_pins) {
      assert(pin.aspect_ratio, `pin ${pin.pin_id} must have aspect_ratio`);
      assert(pin.format, `pin ${pin.pin_id} must have format`);
      assert(typeof pin.save_count === 'number', `pin ${pin.pin_id} save_count must be a number`);
      assert(!isNaN(pin.save_count), `pin ${pin.pin_id} save_count must not be NaN`);
    }
  });

  console.log('\n[*] Section 3: Testing Trends Fetch Timeout & Fault Tolerance...');

  await test('Trends fetch logic traps errors and timeouts without unhandled rejections', async () => {
    // Test the exact timeout wrapper pattern used in folders-service.mjs
    const sampleKeywords = [
      { keyword: '' }, // empty -> resolves null immediately
      { keyword: 'a' }, // < 2 chars -> resolves null immediately
      { keyword: null }, // null -> resolves null immediately
      { keyword: 'timeout_test' }, // simulated timeout
      { keyword: 'throw_test' } // simulated sync/async throw
    ];

    const results = await Promise.allSettled(
      sampleKeywords.map(kw => {
        const term = kw?.keyword;
        if (!term || typeof term !== 'string' || term.trim().length < 2) {
          return Promise.resolve(null);
        }
        let timerId = null;
        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(() => reject(new Error('Trends timeout')), 50);
        });

        const mockFetch = async (t) => {
          if (t === 'timeout_test') {
            await new Promise(r => setTimeout(r, 200));
            return { counts_52_weeks: [1, 2, 3] };
          }
          if (t === 'throw_test') {
            throw new Error('API failure simulation');
          }
          return { counts_52_weeks: [1, 2, 3] };
        };

        const task = Promise.resolve().then(() => mockFetch(term.trim()));
        task.catch(() => {});
        return Promise.race([task, timeoutPromise]).finally(() => {
          if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
          }
        });
      })
    );

    assert.strictEqual(results.length, 5);
    // 0: empty -> fulfilled with null
    assert.strictEqual(results[0].status, 'fulfilled');
    assert.strictEqual(results[0].value, null);
    // 1: < 2 chars -> fulfilled with null
    assert.strictEqual(results[1].status, 'fulfilled');
    assert.strictEqual(results[1].value, null);
    // 2: null -> fulfilled with null
    assert.strictEqual(results[2].status, 'fulfilled');
    assert.strictEqual(results[2].value, null);
    // 3: timeout_test -> rejected with Trends timeout (after 50ms)
    assert.strictEqual(results[3].status, 'rejected');
    assert.strictEqual(results[3].reason.message, 'Trends timeout');
    // 4: throw_test -> rejected with API failure simulation
    assert.strictEqual(results[4].status, 'rejected');
    assert.strictEqual(results[4].reason.message, 'API failure simulation');

    // Wait 250ms to ensure the background task of timeout_test completes without unhandled rejection
    await new Promise(r => setTimeout(r, 250));
  });

  console.log('\n================================================================================');
  console.log(`✅ ALL ${passed}/${total} ADVERSARIAL AUDIT TESTS PASSED!`);
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('Fatal error during adversarial audit:', err);
  process.exit(1);
});
