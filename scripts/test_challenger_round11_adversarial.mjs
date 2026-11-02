/**
 * Round 11 Empirical Adversarial Stress Test Suite
 * Executed by pod_r11_challenger to find bugs and failure modes.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { isSyntheticPinTitle, derivePinTitle, calculateFolderCrossover } from '../src/modules/keywords/folders-service.mjs';
import { executeShardQueryWithCircuitBreaker, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';
import { hydratePinsFromD1, syncPinsBatchToD1 } from '../src/modules/keywords/d1-metadata.mjs';

console.log('================================================================================');
console.log('   ROUND 11 ADVERSARIAL CHALLENGER EMPIRICAL AUDIT SUITE');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name} -> ${details}`);
  }
}

// Read database URL from .env
let dbUrl = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (_) {}

const sql = dbUrl ? neon(dbUrl) : null;

// =============================================================================
// CHALLENGE 1: Shard Query Call Signature in folders-service.mjs:2560 & 2611
// =============================================================================
console.log('[Challenge 1] Testing executeShardQueryWithCircuitBreaker signature mismatch...');

// In folders-service.mjs line 2560 and 2611, the worker wrote:
// executeShardQueryWithCircuitBreaker(shardSql, pShardId, (db) => db`...`, 3000);
// Let's create a mock neon sql function:
const mockNeonClient = async (strings, ...args) => [{ pin_id: '123', title: 'Test Pin' }];
mockNeonClient.query = async () => {};

try {
  // Simulate the exact call made at folders-service.mjs:2560:
  await executeShardQueryWithCircuitBreaker(
    mockNeonClient,
    7, // pShardId
    async (db) => await db`SELECT 1;`,
    3000
  );
  report('executeShardQueryWithCircuitBreaker accepts (shardSql, pShardId, queryFn, timeout)', true);
} catch (err) {
  report(
    'executeShardQueryWithCircuitBreaker accepts (shardSql, pShardId, queryFn, timeout)',
    false,
    `FATAL: Threw "${err.message}". Argument order in folders-service.mjs:2560 & 2611 is inverted!`
  );
}

// Now test with the correct object signature:
try {
  const result = await executeShardQueryWithCircuitBreaker({
    shardId: 7,
    shardSql: mockNeonClient,
    timeoutMs: 3000,
    queryFn: async (db) => await db`SELECT 1;`,
    bypassBreaker: true
  });
  report('executeShardQueryWithCircuitBreaker works with canonical { shardId, shardSql, queryFn } signature', Array.isArray(result));
} catch (err) {
  report('executeShardQueryWithCircuitBreaker canonical signature', false, err.message);
}

// =============================================================================
// CHALLENGE 2: Edge Cases in isSyntheticPinTitle
// =============================================================================
console.log('\n[Challenge 2] Testing isSyntheticPinTitle edge cases...');

// Edge case 2A: Standalone "Inspiration"
// The dispatch specifically requires testing synthetic titles ("Untitled Pin", "Inspiration")
const standaloneInspirationResult = isSyntheticPinTitle('Inspiration');
report(
  'isSyntheticPinTitle("Inspiration") should return true',
  standaloneInspirationResult === true,
  `Returned ${standaloneInspirationResult} (regex requires space before Inspiration)`
);

const lowerInspirationResult = isSyntheticPinTitle('inspiration');
report(
  'isSyntheticPinTitle("inspiration") should return true',
  lowerInspirationResult === true,
  `Returned ${lowerInspirationResult}`
);

// Edge case 2B: Standalone "Pin"
const standalonePinResult = isSyntheticPinTitle('Pin');
report(
  'isSyntheticPinTitle("Pin") should return true',
  standalonePinResult === true,
  `Returned ${standalonePinResult} (regex requires \\w+ after pin)`
);

// Standard synthetic titles
report('isSyntheticPinTitle("") returns true', isSyntheticPinTitle('') === true);
report('isSyntheticPinTitle(null) returns true', isSyntheticPinTitle(null) === true);
report('isSyntheticPinTitle("Untitled Pin") returns true', isSyntheticPinTitle('Untitled Pin') === true);
report('isSyntheticPinTitle("untitled pin") returns true', isSyntheticPinTitle('untitled pin') === true);
report('isSyntheticPinTitle("Oatmeal Inspiration") returns true', isSyntheticPinTitle('Oatmeal Inspiration') === true);
report('isSyntheticPinTitle("Pinterest Visual Guide") returns true', isSyntheticPinTitle('Pinterest Visual Guide') === true);
report('isSyntheticPinTitle("Pin #123456") returns true', isSyntheticPinTitle('Pin #123456') === true);

// Authentic titles
report('isSyntheticPinTitle("Gluten-Free Pancakes") returns false', isSyntheticPinTitle('Gluten-Free Pancakes') === false);
report('isSyntheticPinTitle("Inspiration for Modern Kitchens") returns false', isSyntheticPinTitle('Inspiration for Modern Kitchens') === false);

// =============================================================================
// CHALLENGE 3: S3 ACL Image Waterfall Simulation
// =============================================================================
console.log('\n[Challenge 3] Testing S3 ACL Image Waterfall in campaign-folders-ui.mjs...');

function simulateImageErrorWaterfall(initialUrl) {
  let currentSrc = initialUrl;
  let onErrorHandlerActive = true;
  const stages = [currentSrc];
  let loopCount = 0;

  while (onErrorHandlerActive && loopCount < 10) {
    loopCount++;
    // Exact JS logic from campaign-folders-ui.mjs line 412:
    if (currentSrc.includes('/originals/')) {
      currentSrc = currentSrc.replace('/originals/', '/1200x/');
    } else if (currentSrc.includes('/1200x/')) {
      currentSrc = currentSrc.replace('/1200x/', '/736x/');
    } else {
      onErrorHandlerActive = false;
      currentSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" viewBox="0 0 60 90"><rect width="60" height="90" rx="4" fill="#18181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#52525b" font-family="monospace" font-size="10">PIN</text></svg>';
    }
    stages.push(currentSrc);
  }

  return { stages, finalSrc: currentSrc, loops: loopCount, terminated: !onErrorHandlerActive };
}

// Test from /originals/
const w1 = simulateImageErrorWaterfall('https://i.pinimg.com/originals/ab/cd/ef/pin.jpg');
report('Waterfall from /originals/ transitions to /1200x/ -> /736x/ -> SVG',
  w1.stages[1].includes('/1200x/') &&
  w1.stages[2].includes('/736x/') &&
  w1.stages[3].startsWith('data:image/svg') &&
  w1.terminated
);

// Test from /736x/ (standard pin)
const w2 = simulateImageErrorWaterfall('https://i.pinimg.com/736x/ab/cd/ef/pin.jpg');
report('Waterfall from /736x/ transitions directly to SVG without loop',
  w2.stages[1].startsWith('data:image/svg') && w2.terminated && w2.loops === 1
);

// Test invalid or broken URL
const w3 = simulateImageErrorWaterfall('https://broken-cdn.com/bad.png');
report('Waterfall from external bad CDN falls back to SVG safely',
  w3.stages[1].startsWith('data:image/svg') && w3.terminated && w3.loops === 1
);

// =============================================================================
// CHALLENGE 4: D1 Map Contract with Missing Pins and Mixed ID Types
// =============================================================================
console.log('\n[Challenge 4] Testing D1 Map Contract with Edge Cases...');

const mockD1Storage = new Map();
mockD1Storage.set('281543727244482', {
  pin_id: '281543727244482',
  title: 'Gluten-Free Pancakes',
  image_url: 'https://i.pinimg.com/736x/28/15/43/281543727244482.jpg',
  aspect_ratio: '2:3'
});

const mockEnv = {
  PIN_D1_DB: {
    batch: async (stmts) => {
      const results = [];
      for (const s of stmts) {
        for (const id of s._args) {
          if (mockD1Storage.has(String(id))) {
            results.push(mockD1Storage.get(String(id)));
          }
        }
      }
      return [{ results }];
    },
    prepare: (sql) => ({
      bind: (...args) => ({ _sql: sql, _args: args })
    })
  }
};

// 4A. Query with mixed string and number IDs
const mapResult = await hydratePinsFromD1(mockEnv, [281543727244482, '999999999999999']);
report('hydratePinsFromD1 returns a Map', mapResult instanceof Map);
report('hydratePinsFromD1 resolves numeric string key', mapResult.has('281543727244482'));
report('hydratePinsFromD1 preserves aspect_ratio "2:3"', mapResult.get('281543727244482')?.aspect_ratio === '2:3');
report('hydratePinsFromD1 handles missing pin gracefully without crashing', !mapResult.has('999999999999999'));

// 4B. Query with empty array
const emptyMap = await hydratePinsFromD1(mockEnv, []);
report('hydratePinsFromD1([]) returns empty Map without throwing', emptyMap instanceof Map && emptyMap.size === 0);

// =============================================================================
// CHALLENGE 5: SQL Query Syntax and Execution Against Live Database
// =============================================================================
console.log('\n[Challenge 5] Testing SQL Query Syntax on Live Central Hub...');

if (sql) {
  try {
    const testIds = ['281543727244482', '524950900340768832', '703756189707271'];
    // Test the Tier 2 query from folders-service.mjs line 2490:
    const hubRows = await sql`
      SELECT ksc.pin_id, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
             ksc.creator_username, ksc.board_name, ksc.dominant_color, ksc.visual_annotations,
             ksc.created_at_pinterest
      FROM keyword_serp_current ksc
      WHERE ksc.pin_id = ANY(${testIds}::text[]) AND (ksc.title <> '' OR ksc.image_url <> '')
      UNION ALL
      SELECT cp.pin_id, cp.title, cp.link_domain AS domain, cp.destination_url, cp.image_url,
             '' AS creator_username, cp.board_name, '#888888' AS dominant_color,
             COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
             cp.created_at_pinterest
      FROM competitor_pins cp
      WHERE cp.pin_id = ANY(${testIds}::text[]) AND (cp.title <> '' OR cp.image_url <> '')
      UNION ALL
      SELECT pa.pin_id, pa.title, pa.domain, pa.link AS destination_url, pa.image_url,
             pa.account_username AS creator_username, pa.board_name, pa.dominant_color,
             COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations,
             pa.created_at_pinterest
      FROM pa_pins pa
      WHERE pa.pin_id = ANY(${testIds}::text[]) AND (pa.title <> '' OR pa.image_url <> '')
      LIMIT 100;
    `;
    report('Tier 2 UNION ALL query executes on Live Central Hub without error', Array.isArray(hubRows));
  } catch (err) {
    report('Tier 2 UNION ALL query executes on Live Central Hub without error', false, err.message);
  }

  // Test Tier 3 query against shard 1 (or default shard):
  try {
    const testIds = ['281543727244482'];
    const shardRows = await sql`
      SELECT ump.pin_id, ump.title, ump.domain, ump.destination_url, ump.image_url,
             ump.creator_username, ump.board_name, ump.dominant_color, ump.visual_annotations,
             ump.alt_text, ump.description, ump.created_at_pinterest
      FROM universal_master_pins ump
      WHERE ump.pin_id = ANY(${testIds}::text[])
    `;
    report('Tier 3 universal_master_pins query executes on PostgreSQL without error', Array.isArray(shardRows));
  } catch (err) {
    report('Tier 3 universal_master_pins query executes on PostgreSQL without error', false, err.message);
  }
} else {
  console.log('  ⚠️ SQL connection unavailable in .env, skipping live DB challenges.');
}

// =============================================================================
// CHALLENGE 6: Live Crossover Execution with Circuit Breaker Trip Verification
// =============================================================================
console.log('\n[Challenge 6] Testing calculateFolderCrossover execution on Folder 7...');

if (sql) {
  try {
    // Intercept console.warn to verify if Circuit Breaker tripped
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.join(' '));
      origWarn(...args);
    };

    const crossover = await calculateFolderCrossover(sql, 7, { refresh: true });
    console.warn = origWarn;

    const tripped = warnings.some(w => w.includes('queryFn is not a function'));
    console.log('  [Debug] Captured warnings count:', warnings.length, 'Samples:', warnings.slice(0, 3));
    report(
      'Live calculateFolderCrossover does NOT trip Circuit Breaker with "queryFn is not a function"',
      !tripped,
      tripped ? 'CONFIRMED: Live calculateFolderCrossover tripped circuit breaker because queryFn is not a function!' : ''
    );
  } catch (err) {
    report('calculateFolderCrossover execution', false, err.message);
  }
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================================');
console.log(`CHALLENGE AUDIT COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (Total: ${totalTests})`);
console.log('================================================================================');

if (failedTests > 0) {
  console.log(`\n🚨 CRITICAL FINDINGS DETECTED: ${failedTests} failure modes confirmed empirically.`);
  process.exitCode = 1;
} else {
  console.log('\n✅ All adversarial challenges passed.');
}
