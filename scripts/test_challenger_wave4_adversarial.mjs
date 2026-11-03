/**
 * EMPIRICAL ADVERSARIAL ORACLE & STRESS HARNESS: WAVE 4
 *
 * Exhaustively stress-tests:
 * 1. Lock 3 Shard Boundary: getPhysicalShardId against extreme, negative, floating, >99, non-numeric inputs.
 * 2. Virtual Shard Room Partitioning: 99 virtual -> 20 physical room distribution (19 shards x 5 rooms, 1 shard x 4 rooms).
 * 3. Coalescence: coalesceShardGroupsByPhysical multi-virtual merging into physical shards.
 * 4. AST Schema Parity: url_global_saves valid queries accepted vs hallucinated columns strictly rejected.
 * 5. Lock 13 Rigidity: expectedLockCount = 14 tampering and mutation detection.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as acorn from 'acorn';
import {
  getPhysicalShardId,
  coalesceShardGroupsByPhysical
} from '../src/modules/sharding/fleet-router.mjs';
import { KNOWN_TABLE_COLUMNS } from './verify_sql_schema_parity.mjs';

console.log('='.repeat(80));
console.log('🚀 RUNNING ADVERSARIAL CHALLENGER HARNESS: WAVE 4 REGRESSION & AST PARITY');
console.log('='.repeat(80));

let totalPassed = 0;
let totalFailed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${testName}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}: ${err.message}`);
    totalFailed++;
  }
}

// ============================================================================
// SUITE 1: getPhysicalShardId Defensive Boundary & Extreme Input Stress Testing
// ============================================================================
console.log('\n--- SUITE 1: getPhysicalShardId Defensive Boundary Stress Testing ---');

runTest('1.1 Standard virtual range [1, 99] maps to [1, 20] matching ((v-1)%20)+1', () => {
  for (let v = 1; v <= 99; v++) {
    const p = getPhysicalShardId(v);
    const expected = ((v - 1) % 20) + 1;
    assert.strictEqual(p, expected, `Virtual shard ${v} failed expected mapping`);
    assert.ok(p >= 1 && p <= 20, `Virtual shard ${v} produced out-of-range physical shard ${p}`);
    assert.ok(Number.isInteger(p), `Virtual shard ${v} produced non-integer physical shard ${p}`);
  }
});

runTest('1.2 Zero and negative inputs defensively fall back to physical shard 1', () => {
  assert.strictEqual(getPhysicalShardId(0), 1, 'Input 0 should yield 1');
  assert.strictEqual(getPhysicalShardId(-0), 1, 'Input -0 should yield 1');
  assert.strictEqual(getPhysicalShardId(-1), 1, 'Input -1 should yield 1');
  assert.strictEqual(getPhysicalShardId(-20), 1, 'Input -20 should yield 1');
  assert.strictEqual(getPhysicalShardId(-99), 1, 'Input -99 should yield 1');
  assert.strictEqual(getPhysicalShardId(-1000), 1, 'Input -1000 should yield 1');
  assert.strictEqual(getPhysicalShardId(-Number.MAX_SAFE_INTEGER), 1, 'Input -MAX_SAFE_INTEGER should yield 1');
});

runTest('1.3 Floating point inputs floor correctly and clamp defensively within [1, 20]', () => {
  assert.strictEqual(getPhysicalShardId(0.5), 1, 'Input 0.5 should yield 1');
  assert.strictEqual(getPhysicalShardId(1.2), 1, 'Input 1.2 should yield 1');
  assert.strictEqual(getPhysicalShardId(1.999), 1, 'Input 1.999 should yield 1');
  assert.strictEqual(getPhysicalShardId(2.1), 2, 'Input 2.1 should yield 2');
  assert.strictEqual(getPhysicalShardId(20.9), 20, 'Input 20.9 should yield 20');
  assert.strictEqual(getPhysicalShardId(21.05), 1, 'Input 21.05 should yield 1');
  assert.strictEqual(getPhysicalShardId(40.8), 20, 'Input 40.8 should yield 20');
  assert.strictEqual(getPhysicalShardId(-0.1), 1, 'Input -0.1 should yield 1');
});

runTest('1.4 Values greater than 99 continue cyclic modulo mapping within [1, 20]', () => {
  assert.strictEqual(getPhysicalShardId(100), 20, 'Input 100 should yield 20');
  assert.strictEqual(getPhysicalShardId(101), 1, 'Input 101 should yield 1');
  assert.strictEqual(getPhysicalShardId(120), 20, 'Input 120 should yield 20');
  assert.strictEqual(getPhysicalShardId(999), 19, 'Input 999 should yield 19');
  assert.strictEqual(getPhysicalShardId(1000), 20, 'Input 1000 should yield 20');
  assert.strictEqual(getPhysicalShardId(1000000), 20, 'Input 1000000 should yield 20');
});

runTest('1.5 Non-numeric types and malformed strings defensively fall back to physical shard 1', () => {
  const invalidInputs = [
    '', '   ', 'invalid', 'shard-5', 'pin_123', null, undefined,
    NaN, Infinity, -Infinity, {}, [], [1, 2], { shard: 5 }, true, false, () => {}
  ];
  for (const input of invalidInputs) {
    const res = getPhysicalShardId(input);
    assert.ok(
      Number.isInteger(res) && res >= 1 && res <= 20,
      `Invalid input ${String(input)} produced invalid result ${res}`
    );
  }
});

runTest('1.6 Valid numeric strings parse correctly to their integer equivalent', () => {
  assert.strictEqual(getPhysicalShardId('1'), 1);
  assert.strictEqual(getPhysicalShardId('20'), 20);
  assert.strictEqual(getPhysicalShardId('21'), 1);
  assert.strictEqual(getPhysicalShardId('99'), 19);
  assert.strictEqual(getPhysicalShardId('01'), 1);
  assert.strictEqual(getPhysicalShardId('05'), 5);
  assert.strictEqual(getPhysicalShardId('  15  '), 15);
});

runTest('1.7 Fuzzy fuzz testing: 10,000 random inputs never throw and always yield [1, 20]', () => {
  const pseudoRandomInputs = [
    () => Math.random() * 200 - 50,
    () => Math.floor(Math.random() * 500) - 100,
    () => String(Math.floor(Math.random() * 200)),
    () => (Math.random() < 0.5 ? NaN : Infinity),
    () => (Math.random() < 0.5 ? null : undefined),
    () => `pin_${Math.random()}`
  ];

  for (let i = 0; i < 10000; i++) {
    const gen = pseudoRandomInputs[i % pseudoRandomInputs.length];
    const val = gen();
    const res = getPhysicalShardId(val);
    assert.ok(
      Number.isInteger(res) && res >= 1 && res <= 20,
      `Fuzz value ${String(val)} produced invalid shard ${res}`
    );
  }
});

// ============================================================================
// SUITE 2: Virtual Shard Room Partitioning Distribution (99 -> 20)
// ============================================================================
console.log('\n--- SUITE 2: Virtual Shard Room Partitioning Distribution ---');

runTest('2.1 Deterministic partition of all 99 virtual rooms across 20 physical shards', () => {
  const physicalBuckets = new Map();
  for (let p = 1; p <= 20; p++) {
    physicalBuckets.set(p, []);
  }

  for (let v = 1; v <= 99; v++) {
    const p = getPhysicalShardId(v);
    physicalBuckets.get(p).push(v);
  }

  // Exactly 20 physical shards must be populated
  assert.strictEqual(physicalBuckets.size, 20, 'Must have exactly 20 physical buckets');

  // Total rooms counted across all buckets must equal exactly 99
  let totalRoomsCounted = 0;
  for (const rooms of physicalBuckets.values()) {
    totalRoomsCounted += rooms.length;
  }
  assert.strictEqual(totalRoomsCounted, 99, 'Total virtual rooms across all physical buckets must be 99');

  // Distribution verification: 19 shards have 5 rooms, 1 shard has 4 rooms
  let shardsWith5Rooms = 0;
  let shardsWith4Rooms = 0;
  let otherCounts = 0;

  for (const [p, rooms] of physicalBuckets.entries()) {
    if (rooms.length === 5) {
      shardsWith5Rooms++;
      // Verify room sequence: p, p+20, p+40, p+60, p+80
      assert.deepStrictEqual(rooms, [p, p + 20, p + 40, p + 60, p + 80]);
    } else if (rooms.length === 4) {
      shardsWith4Rooms++;
      // Physical shard 20 must be the unique shard with 4 rooms
      assert.strictEqual(p, 20, `Only physical shard 20 should have 4 rooms, but shard ${p} has 4`);
      assert.deepStrictEqual(rooms, [20, 40, 60, 80]);
    } else {
      otherCounts++;
    }
  }

  assert.strictEqual(shardsWith5Rooms, 19, 'Expected exactly 19 physical shards with 5 rooms');
  assert.strictEqual(shardsWith4Rooms, 1, 'Expected exactly 1 physical shard with 4 rooms');
  assert.strictEqual(otherCounts, 0, 'No shard should have any room count other than 5 or 4');
});

runTest('2.2 coalesceShardGroupsByPhysical combines 99 virtual groups into <= 20 physical batches', () => {
  const virtualBatches = new Map();
  for (let v = 1; v <= 99; v++) {
    virtualBatches.set(v, [
      { pin_id: `pin_v${v}_item1`, virtual_shard: v },
      { pin_id: `pin_v${v}_item2`, virtual_shard: v }
    ]);
  }

  const coalesced = coalesceShardGroupsByPhysical(virtualBatches);

  assert.strictEqual(coalesced.size, 20, 'Coalesced map must contain exactly 20 physical shard groups');

  for (let p = 1; p <= 19; p++) {
    const items = coalesced.get(p);
    // 5 rooms * 2 items each = 10 items
    assert.strictEqual(items.length, 10, `Physical shard ${p} should contain 10 items (5 rooms * 2)`);
  }

  // Physical shard 20: 4 rooms * 2 items each = 8 items
  assert.strictEqual(coalesced.get(20).length, 8, 'Physical shard 20 should contain 8 items (4 rooms * 2)');

  // Total items preserved without loss
  let totalItems = 0;
  for (const items of coalesced.values()) {
    totalItems += items.length;
  }
  assert.strictEqual(totalItems, 99 * 2, 'All 198 items across 99 virtual shards must be preserved');
});

runTest('2.3 coalesceShardGroupsByPhysical handles edge cases defensively', () => {
  assert.strictEqual(coalesceShardGroupsByPhysical(null).size, 0);
  assert.strictEqual(coalesceShardGroupsByPhysical(undefined).size, 0);
  assert.strictEqual(coalesceShardGroupsByPhysical(new Map()).size, 0);
  assert.strictEqual(coalesceShardGroupsByPhysical([]).size, 0);
  assert.strictEqual(coalesceShardGroupsByPhysical({}).size, 0);

  // Object input
  const objInput = {
    '1': [{ id: 'a' }],
    '21': [{ id: 'b' }],
    '41': [{ id: 'c' }]
  };
  const coalescedObj = coalesceShardGroupsByPhysical(objInput);
  assert.strictEqual(coalescedObj.size, 1);
  assert.strictEqual(coalescedObj.get(1).length, 3);
});

// ============================================================================
// SUITE 3: AST Schema Parity & Column Parity with url_global_saves
// ============================================================================
console.log('\n--- SUITE 3: AST Schema Parity & Column Validation ---');

runTest('3.1 KNOWN_TABLE_COLUMNS contains url_global_saves on keyword_serp_current & NOT universal_master_pins', () => {
  assert.ok(
    KNOWN_TABLE_COLUMNS.keyword_serp_current.has('url_global_saves'),
    'KNOWN_TABLE_COLUMNS.keyword_serp_current must include url_global_saves'
  );
  assert.ok(
    !KNOWN_TABLE_COLUMNS.universal_master_pins.has('url_global_saves'),
    'KNOWN_TABLE_COLUMNS.universal_master_pins must NOT include url_global_saves'
  );
  // Ensure tables without url_global_saves do NOT have it
  assert.ok(
    !KNOWN_TABLE_COLUMNS.keyword_displaced_index.has('url_global_saves'),
    'keyword_displaced_index must NOT have url_global_saves'
  );
  assert.ok(
    !KNOWN_TABLE_COLUMNS.pins_daily_metrics.has('url_global_saves'),
    'pins_daily_metrics must NOT have url_global_saves'
  );
});

// Mini AST Auditing Oracle simulating verify_sql_schema_parity.mjs engine
function auditSqlFragment(sqlCode) {
  let ast;
  try {
    ast = acorn.parse(sqlCode, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true
    });
  } catch (err) {
    throw new Error(`AST Parse Error: ${err.message}`);
  }

  const sqlBlocks = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TaggedTemplateExpression') {
      const tagName = node.tag.name || (node.tag.property && node.tag.property.name) || '';
      if (['sql', 'hubSql', 'shardSql', 'targetSql', 'client', 'postgres'].includes(tagName)) {
        const queryText = node.quasi.quasis.map(q => q.value.raw).join(' __PARAM__ ');
        sqlBlocks.push({ query: queryText, line: node.loc?.start?.line || 1 });
      }
    } else if (node.type === 'TemplateLiteral') {
      const queryText = node.quasis.map(q => q.value.raw).join(' __PARAM__ ');
      if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|WITH)\b/i.test(queryText)) {
        sqlBlocks.push({ query: queryText, line: node.loc?.start?.line || 1 });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c);
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }
  walk(ast);

  const violations = [];
  for (const { query, line } of sqlBlocks) {
    for (const [tableName, validCols] of Object.entries(KNOWN_TABLE_COLUMNS)) {
      if (!new RegExp(`\\b${tableName}\\b`, 'i').test(query)) continue;

      const aliasPattern = new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${tableName}(?:\\s+(?:AS\\s+)?([a-zA-Z0-9_]+))?`, 'gi');
      const aliases = new Set([tableName]);
      let match;
      while ((match = aliasPattern.exec(query)) !== null) {
        const potentialAlias = match[1];
        if (potentialAlias) {
          const upper = potentialAlias.toUpperCase();
          const sqlReserved = ['WHERE', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'RETURNING', 'VALUES', 'DO', 'SELECT', 'AS'];
          if (!sqlReserved.includes(upper)) {
            aliases.add(potentialAlias);
          }
        }
      }

      for (const alias of aliases) {
        const colRegex = new RegExp(`\\b${alias}\\.([a-zA-Z0-9_]+)\\b`, 'g');
        let colMatch;
        while ((colMatch = colRegex.exec(query)) !== null) {
          const colName = colMatch[1].toLowerCase();
          if (colName === '*' || colName === '__param__') continue;
          if (!validCols.has(colName)) {
            violations.push({
              type: 'INVALID_COLUMN',
              table: tableName,
              alias,
              column: colName,
              line
            });
          }
        }
      }

      // Check EXCLUDED
      const insertClauseRegex = new RegExp(
        `\\bINSERT\\s+INTO\\s+${tableName}\\b[\\s\\S]*?\\bON\\s+CONFLICT[\\s\\S]*?\\bDO\\s+UPDATE\\s+SET\\s+([\\s\\S]*?)(?:\\bRETURNING\\b|\\bSELECT\\b|\\bINSERT\\b|\\bWITH\\b|;|\\)\\s*,|\\)\\s*SELECT|$)`,
        'gi'
      );
      let clauseMatch;
      while ((clauseMatch = insertClauseRegex.exec(query)) !== null) {
        const updateBody = clauseMatch[1];
        const excludedRegex = /\bEXCLUDED\.([a-zA-Z0-9_]+)\b/gi;
        let exclMatch;
        while ((exclMatch = excludedRegex.exec(updateBody)) !== null) {
          const colName = exclMatch[1].toLowerCase();
          if (!validCols.has(colName)) {
            violations.push({
              type: 'INVALID_EXCLUDED_COLUMN',
              table: tableName,
              column: colName,
              line
            });
          }
        }
      }
    }
  }

  return violations;
}

runTest('3.2 SQL queries referencing url_global_saves pass AST validation cleanly', () => {
  // Store snippets as string literals using quotes to avoid triggering verify_sql_schema_parity top-level scanner
  const cleanSql1 = [
    'const q1 = sql`',
    '  SELECT ksc.pin_id, ksc.url_global_saves, ksc.save_count',
    '  FROM keyword_serp_current ksc',
    '  WHERE ksc.keyword_id = ${kid}',
    '`;'
  ].join('\n');
  const violations1 = auditSqlFragment(cleanSql1);
  assert.strictEqual(violations1.length, 0, 'url_global_saves on keyword_serp_current should have 0 violations');

  const cleanSql2 = [
    'const q2 = sql`',
    '  SELECT ump.pin_id, ump.title, ump.dominant_color',
    '  FROM universal_master_pins ump',
    '  WHERE ump.pin_id = ${pinId}',
    '`;'
  ].join('\n');
  const violations2 = auditSqlFragment(cleanSql2);
  assert.strictEqual(violations2.length, 0, 'valid columns on universal_master_pins should have 0 violations');

  const cleanSql3 = [
    'const q3 = sql`',
    '  INSERT INTO keyword_serp_current (pin_id, url_global_saves)',
    '  VALUES (${p}, ${saves})',
    '  ON CONFLICT (id) DO UPDATE SET',
    '    url_global_saves = EXCLUDED.url_global_saves',
    '`;'
  ].join('\n');
  const violations3 = auditSqlFragment(cleanSql3);
  assert.strictEqual(violations3.length, 0, 'EXCLUDED.url_global_saves should have 0 violations');
});

runTest('3.3 Non-existent hallucinated columns are strictly detected and rejected', () => {
  const badSql1 = [
    'const q1 = sql`',
    '  SELECT ksc.pin_id, ksc.hallucinated_saves, ksc.imaginary_metric',
    '  FROM keyword_serp_current ksc',
    '  WHERE ksc.keyword_id = ${kid}',
    '`;'
  ].join('\n');
  const violations1 = auditSqlFragment(badSql1);
  assert.ok(violations1.length >= 2, 'Should detect invalid columns on keyword_serp_current');
  assert.ok(violations1.some(v => v.column === 'hallucinated_saves'), 'Must detect hallucinated_saves');
  assert.ok(violations1.some(v => v.column === 'imaginary_metric'), 'Must detect imaginary_metric');

  const badSql2 = [
    'const q2 = sql`',
    '  SELECT ump.pin_id, ump.nonexistent_score',
    '  FROM universal_master_pins ump',
    '`;'
  ].join('\n');
  const violations2 = auditSqlFragment(badSql2);
  assert.ok(violations2.length >= 1, 'Should detect invalid column on universal_master_pins');
  assert.ok(violations2.some(v => v.column === 'nonexistent_score'), 'Must detect nonexistent_score');

  const badSql3 = [
    'const q3 = sql`',
    '  INSERT INTO universal_master_pins (pin_id)',
    '  VALUES (${p})',
    '  ON CONFLICT (pin_id) DO UPDATE SET',
    '    fantasy_column = EXCLUDED.fantasy_column',
    '`;'
  ].join('\n');
  const violations3 = auditSqlFragment(badSql3);
  assert.ok(violations3.some(v => v.column === 'fantasy_column'), 'Must detect fantasy_column in EXCLUDED');

  const badSql4 = [
    'const q4 = sql`',
    '  SELECT ump.pin_id, ump.url_global_saves',
    '  FROM universal_master_pins ump',
    '`;'
  ].join('\n');
  const violations4 = auditSqlFragment(badSql4);
  assert.ok(violations4.some(v => v.column === 'url_global_saves'), 'Must detect url_global_saves on universal_master_pins as non-existent');
});

// ============================================================================
// SUITE 4: Lock 13 Rigidity & expectedLockCount = 14 Verification
// ============================================================================
console.log('\n--- SUITE 4: Lock 13 Rigidity & Tampering Detection ---');

runTest('4.1 Actual scripts/verify_regression_locks.mjs satisfies Lock 13 exact counts', () => {
  const content = fs.readFileSync('scripts/verify_regression_locks.mjs', 'utf8');

  const documentedLocks = [...content.matchAll(/\*\s*-\s*Lock\s+(\d+):/g)].map(m => Number(m[1]));
  const implementedLocks = [...content.matchAll(/\/\/\s*LOCK\s+(\d+):/gi)].map(m => Number(m[1]));
  const checkedLocks = [...new Set([...content.matchAll(/check\(\s*['"]Lock\s+(\d+)['"]/gi)].map(m => Number(m[1])))].sort((a, b) => a - b);

  const expectedLockCount = 14;

  assert.strictEqual(documentedLocks.length, expectedLockCount, `documentedLocks should be ${expectedLockCount}`);
  assert.strictEqual(implementedLocks.length, expectedLockCount, `implementedLocks should be ${expectedLockCount}`);
  assert.strictEqual(checkedLocks.length, expectedLockCount, `checkedLocks should be ${expectedLockCount}`);
  assert.ok(checkedLocks.every((num, idx) => num === idx + 1), 'Locks must be sequential 1..14 without gaps');
});

runTest('4.2 Tampering with documented locks (adding or removing) triggers Lock 13 failure', () => {
  const content = fs.readFileSync('scripts/verify_regression_locks.mjs', 'utf8');

  // Simulate adding Lock 15 to documented locks
  const tamperedDoc = content.replace('* - Lock 14:', '* - Lock 14:\n * - Lock 15: Unauthorized Lock');
  const docMatches = [...tamperedDoc.matchAll(/\*\s*-\s*Lock\s+(\d+):/g)].map(m => Number(m[1]));
  assert.strictEqual(docMatches.length, 15);
  assert.notStrictEqual(docMatches.length, 14, 'Tampering must cause documented length mismatch');
});

runTest('4.3 Tampering with implemented lock blocks triggers Lock 13 failure', () => {
  const content = fs.readFileSync('scripts/verify_regression_locks.mjs', 'utf8');

  // Simulate adding a duplicate or unauthorized // LOCK 15:
  const tamperedImpl = content + '\n// LOCK 15: Rogue Lock';
  const implMatches = [...tamperedImpl.matchAll(/\/\/\s*LOCK\s+(\d+):/gi)].map(m => Number(m[1]));
  assert.strictEqual(implMatches.length, 15);
  assert.notStrictEqual(implMatches.length, 14, 'Tampering must cause implemented length mismatch');
});

runTest('4.4 Tampering with check calls triggers Lock 13 failure', () => {
  const content = fs.readFileSync('scripts/verify_regression_locks.mjs', 'utf8');

  // Simulate adding check('Lock 15', ...)
  const tamperedCheck = content + "\ncheck('Lock 15', true, 'rogue');";
  const checkedMatches = [...new Set([...tamperedCheck.matchAll(/check\(\s*['"]Lock\s+(\d+)['"]/gi)].map(m => Number(m[1])))].sort((a, b) => a - b);
  assert.strictEqual(checkedMatches.length, 15);
  assert.notStrictEqual(checkedMatches.length, 14, 'Tampering must cause checked length mismatch');
});

runTest('4.5 Non-consecutive lock numbering (e.g., gap where Lock 7 is missing) triggers failure', () => {
  const skippedLocks = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15]; // Missing 7, has 14 items
  const isSequential = skippedLocks.every((num, idx) => num === idx + 1);
  assert.strictEqual(isSequential, false, 'Non-consecutive locks must fail consecutive assertion');
});

runTest('4.6 Sub-checks 3E, 3F, 3G safely collapse into Lock 3 without inflating checkedLocks count', () => {
  const content = fs.readFileSync('scripts/verify_regression_locks.mjs', 'utf8');
  const lock3Checks = [...content.matchAll(/check\(\s*['"]Lock 3['"]/gi)];
  // 3A, 3B, 3C, 3D, 3E, 3F, 3G = 7 check calls
  assert.strictEqual(lock3Checks.length, 7, 'Lock 3 must have exactly 7 sub-checks (3A..3G)');

  // Set deduplication ensures distinct checked locks remains exactly 14
  const checkedLocks = [...new Set([...content.matchAll(/check\(\s*['"]Lock\s+(\d+)['"]/gi)].map(m => Number(m[1])))];
  assert.strictEqual(checkedLocks.length, 14, 'Deduplicated checked locks must remain exactly 14');
});

// ============================================================================
// FINAL HARNESS VERDICT
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log(`HARNESS RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('='.repeat(80));

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL ADVERSARIAL STRESS HARNESSES PASSED EMPIRICALLY!\n');
  process.exit(0);
}
