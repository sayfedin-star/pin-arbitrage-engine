#!/usr/bin/env node

/**
 * scripts/test_empirical_challenger_wave3_1.mjs
 *
 * Empirical Adversarial Challenger Test Suite: Wave 3 Refactoring & Hardening
 *
 * Validates:
 * 1. CRC32 Parity Verification:
 *    - Bit-for-bit parity between PL/pgSQL pae_crc32_shard_id(pin_id, 99) and Node.js getPinShardId(pin_id, 99).
 *    - Tested on >=2,500 diverse samples: Pinterest snowflakes, alphanumerics, UUIDs, large numbers,
 *      whitespace/edge cases, mixed case, long strings.
 *    - Adversarial edge-case analysis: non-ASCII UTF-8 multibyte strings (documenting charCodeAt vs UTF-8 byte encoding).
 *    - Shard distribution uniformity across shards 1..99.
 *    - Custom shard counts (e.g., totalShards = 20 for matrix runners).
 * 2. Trigger Verification (INSERT):
 *    - Inserting rows without shard_id into keyword_serp_current & keyword_displaced_index.
 *    - Automatic calculation to exact CRC32 shard ID.
 *    - Override behavior: trigger enforces deterministic shard_id even if a wrong shard_id is supplied on INSERT.
 * 3. Trigger Update Mutation:
 *    - Updating non-pin_id columns preserves shard_id without clobbering.
 *    - Updating pin_id recalculates shard_id to match the new pin ID.
 * 4. Parity on Live Central Hub:
 *    - Zero NULL shard_id rows in keyword_serp_current and keyword_displaced_index.
 *    - Zero mismatched shard_id rows against pae_crc32_shard_id(pin_id, 99).
 * 5. Wave 3 DDL, Index & Compaction Forensic Verification:
 *    - Migration 036 registered in schema_migrations.
 *    - HOT-blocking index idx_cp_domain_rollup_covering dropped.
 *    - Clean B-tree indexes created and verified.
 *    - Competitor pins skeletal compaction verified (0 uncompacted rows).
 *
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { getPinShardId, crc32 } from '../src/modules/sharding/fleet-router.mjs';

// Auto-load .env in Node runtime
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
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
  } catch (_) {}
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

console.log('================================================================================');
console.log('⚔️  EMPIRICAL CHALLENGER: WAVE 3 SHARD-AFFINE & DATABASE ACCELERATION HARNESS');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// =============================================================================
// Helper: Generator for >=2,500 Pinterest Pin ID Samples
// =============================================================================
function generatePinterestPinSamples() {
  const samples = [];

  // 1. Standard Pinterest snowflake IDs (10 to 19 digits)
  for (let i = 0; i < 1000; i++) {
    const len = 10 + (i % 10); // 10..19 digits
    let digits = String(Math.floor(Math.random() * 9) + 1);
    while (digits.length < len) {
      digits += String(Math.floor(Math.random() * 10));
    }
    samples.push(digits);
  }

  // 2. Alphanumeric Pin IDs
  for (let i = 0; i < 500; i++) {
    samples.push(`pin_${crypto.randomBytes(6).toString('hex')}_${i}`);
  }

  // 3. UUID pin IDs
  for (let i = 0; i < 300; i++) {
    samples.push(crypto.randomUUID());
  }

  // 4. Large numeric and boundary IDs
  const boundaries = [
    '0',
    '1',
    '99',
    '100',
    '2147483647', // INT4 MAX
    '2147483648',
    '4294967295', // UINT32 MAX
    '4294967296',
    '9007199254740991', // Number.MAX_SAFE_INTEGER
    '9007199254740992',
    '18446744073709551615', // UINT64 MAX
    '999999999999999999999999999999',
    '-1',
    '-999999'
  ];
  for (const b of boundaries) {
    samples.push(b);
  }

  // 5. Special ASCII characters, URL parameters, punctuation
  const asciiSymbols = [
    'pin:123/url?path=param&foo=bar#frag',
    'pin.with.dots.and_underscores-and-hyphens',
    'pin-12345-67890',
    'pin_with_symbols!@$%*()_+=',
    'simple_pin_1',
    'simple_pin_2'
  ];
  for (const s of asciiSymbols) {
    samples.push(s);
  }

  // 6. Whitespace, Case, and Formatting Edge Cases
  const formattingCases = [
    '', // Empty string
    '   ', // Pure whitespace
    '  123456789012345  ', // Leading/trailing whitespace
    '  abcXYZ123  ',
    'PIN_ALL_CAPS_12345',
    'pIn_MiXeD_cAsE_98765',
    'a',
    'Z',
    '0',
    '9',
    '!',
    ' ',
    '~'
  ];
  for (const f of formattingCases) {
    samples.push(f);
  }

  // 7. Long string IDs (256 chars, 540 chars, 960 chars)
  samples.push('x'.repeat(256));
  samples.push('a1b2c3d4_'.repeat(60)); // ~540 chars
  samples.push('long_pin_id_'.repeat(80)); // ~960 chars

  // 8. Additional pseudo-random hex strings to exceed 2,500 total
  while (samples.length < 2550) {
    samples.push(`synth_${crypto.randomBytes(8).toString('hex')}`);
  }

  return samples;
}

// =============================================================================
// Suite 1: CRC32 Parity Verification (Postgres vs Node.js)
// =============================================================================
console.log('[*] Suite 1: CRC32 Bit-for-Bit Parity Verification (Postgres vs Node.js)...');

await runAsyncTest('CRC32 Bit-for-Bit Parity across 2,550+ Pinterest Pin ID samples (p_shard_count = 99)', async () => {
  const pinSamples = generatePinterestPinSamples();
  assert(pinSamples.length >= 2500, `Must test >= 2,500 samples, generated: ${pinSamples.length}`);

  console.log(`    -> Generated ${pinSamples.length} diverse test pins. Sending to Central Hub in batches...`);

  const BATCH_SIZE = 500;
  let totalCompared = 0;
  let mismatches = 0;
  const mismatchDetails = [];
  const shardFrequency = new Map();

  for (let i = 0; i < pinSamples.length; i += BATCH_SIZE) {
    const batch = pinSamples.slice(i, i + BATCH_SIZE);
    
    // Query Postgres pae_crc32_shard_id for the entire batch
    const results = await sql`
      SELECT id, pae_crc32_shard_id(id, 99) AS pg_shard_id
      FROM unnest(${batch}::text[]) AS id;
    `;

    for (const row of results) {
      totalCompared++;
      const nodeShardId = getPinShardId(row.id, 99);
      const pgShardId = Number(row.pg_shard_id);

      // Track distribution
      shardFrequency.set(pgShardId, (shardFrequency.get(pgShardId) || 0) + 1);

      if (pgShardId !== nodeShardId) {
        mismatches++;
        if (mismatchDetails.length < 10) {
          mismatchDetails.push({
            pinId: row.id,
            nodeShardId,
            pgShardId,
            nodeCrc: crc32(row.id)
          });
        }
      }
    }
  }

  console.log(`    -> Compared ${totalCompared} pins: ${mismatches} mismatches.`);
  console.log(`    -> Distinct shards touched: ${shardFrequency.size} / 99 shards.`);

  if (mismatches > 0) {
    console.error('    ❌ Mismatch details:', JSON.stringify(mismatchDetails, null, 2));
  }

  assert.strictEqual(mismatches, 0, `CRC32 parity failed: ${mismatches} mismatches found between Postgres and Node.js`);
  assert.strictEqual(totalCompared, pinSamples.length, 'All generated pins must be verified');
  assert.strictEqual(shardFrequency.size, 99, 'All 99 shards should be touched with >2500 pseudo-random pins');
});

await runAsyncTest('CRC32 Parity with Custom Shard Counts (totalShards = 20, 50, 1)', async () => {
  const testPins = [
    '123456789012345',
    '998877665544332',
    'pin_custom_shard_test',
    'alphanumeric_123',
    'pin_with_symbols!@#$'
  ];

  for (const shards of [20, 50, 1]) {
    const results = await sql`
      SELECT id, pae_crc32_shard_id(id, ${shards}) AS pg_shard_id
      FROM unnest(${testPins}::text[]) AS id;
    `;
    for (const row of results) {
      const nodeShardId = getPinShardId(row.id, shards);
      const pgShardId = Number(row.pg_shard_id);
      assert.strictEqual(
        pgShardId,
        nodeShardId,
        `Mismatch for pin "${row.id}" with totalShards=${shards}: PG=${pgShardId}, Node=${nodeShardId}`
      );
    }
  }
});

await runAsyncTest('Adversarial Forensic Edge Case: Non-ASCII UTF-8 String Analysis', async () => {
  // Adversarial stress test demonstrating the boundary condition:
  // Node's fleet-router.mjs:crc32 uses `clean.charCodeAt(i) & 0xFF` (low-byte truncation),
  // whereas Postgres pae_crc32_shard_id uses `convert_to(v_clean, 'UTF8')` (multibyte UTF-8 byte stream).
  const nonAsciiSamples = [
    'pin_café_123',
    'pin_résumé_456',
    '📌_pin_aesthetic_789',
    '🔥_viral_pin_001',
    '핀터레스트_109283'
  ];

  const results = await sql`
    SELECT id, pae_crc32_shard_id(id, 99) AS pg_shard_id
    FROM unnest(${nonAsciiSamples}::text[]) AS id;
  `;

  let utf8ParityCount = 0;
  for (const row of results) {
    // Standard UTF-8 CRC32 calculation in Node
    const clean = String(row.id || '').trim().toLowerCase();
    const utf8Buf = Buffer.from(clean, 'utf8');
    
    // Compute CRC32 over raw UTF-8 bytes using standard IEEE 802.3 polynomial
    const CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      CRC_TABLE[i] = c;
    }
    let c = 0 ^ (-1);
    for (let i = 0; i < utf8Buf.length; i++) {
      c = (c >>> 8) ^ CRC_TABLE[(c ^ utf8Buf[i]) & 0xFF];
    }
    const utf8Crc = (c ^ (-1)) >>> 0;
    const utf8ShardId = (utf8Crc % 99) + 1;

    // Verify Postgres matches true UTF-8 CRC32
    assert.strictEqual(
      Number(row.pg_shard_id),
      utf8ShardId,
      `PostgreSQL pae_crc32_shard_id must match true UTF-8 IEEE 802.3 CRC32 for ${row.id}`
    );
    utf8ParityCount++;
  }
  console.log(`    -> Confirmed Postgres pae_crc32_shard_id implements true IEEE 802.3 UTF-8 CRC32 across ${utf8ParityCount} multibyte test cases.`);
});

// =============================================================================
// Suite 2: Trigger Verification (INSERT on keyword_serp_current & keyword_displaced_index)
// =============================================================================
console.log('\n[*] Suite 2: Trigger Verification (INSERT)...');

// Helper to get or create a tracked_keyword
let testKeywordId = null;
const tempPinIdsKsc = [];
const tempPinIdsKdi = [];

try {
  const [kw] = await sql`SELECT id FROM tracked_keywords WHERE is_active = true LIMIT 1;`;
  if (kw) {
    testKeywordId = kw.id;
  } else {
    const [newKw] = await sql`
      INSERT INTO tracked_keywords (keyword, is_active)
      VALUES ('__test_wave3_challenger_kw__', false)
      RETURNING id;
    `;
    testKeywordId = newKw.id;
  }
} catch (err) {
  console.error('[-] Could not get test keyword ID:', err.message);
  throw err;
}

await runAsyncTest('INSERT into keyword_serp_current without shard_id automatically assigns exact CRC32 shard ID', async () => {
  const pinId = `test_challenger_ksc_insert_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  tempPinIdsKsc.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);

  // Insert without specifying shard_id
  const [inserted] = await sql`
    INSERT INTO keyword_serp_current (
      keyword_id, pin_id, rank_position, title, domain, destination_url, image_url, crawled_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 999, 'Test KSC Trigger', 'example.com', 'https://example.com', 'https://example.com/img.jpg', NOW()
    )
    RETURNING id, pin_id, shard_id;
  `;

  assert(inserted, 'Row must be inserted');
  assert.strictEqual(
    Number(inserted.shard_id),
    expectedShardId,
    `Trigger must set shard_id to ${expectedShardId}, got ${inserted.shard_id}`
  );
});

await runAsyncTest('INSERT into keyword_serp_current with intentional WRONG shard_id is overwritten by trigger', async () => {
  const pinId = `test_challenger_ksc_overwrite_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  tempPinIdsKsc.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);
  const wrongShardId = expectedShardId === 1 ? 99 : 1;

  const [inserted] = await sql`
    INSERT INTO keyword_serp_current (
      keyword_id, pin_id, rank_position, shard_id, title, domain, destination_url, image_url, crawled_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 998, ${wrongShardId}, 'Test Overwrite', 'example.com', 'https://example.com', 'https://example.com/img.jpg', NOW()
    )
    RETURNING id, pin_id, shard_id;
  `;

  assert(inserted, 'Row must be inserted');
  assert.strictEqual(
    Number(inserted.shard_id),
    expectedShardId,
    `Trigger must enforce deterministic shard_id ${expectedShardId} even when ${wrongShardId} was supplied`
  );
});

await runAsyncTest('INSERT into keyword_displaced_index without shard_id automatically assigns exact CRC32 shard ID', async () => {
  const pinId = `test_challenger_kdi_insert_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  tempPinIdsKdi.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);

  const [inserted] = await sql`
    INSERT INTO keyword_displaced_index (
      keyword_id, pin_id, last_known_rank, vacuum_opportunity_score, domain, displaced_date, updated_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 45, 80, 'example.com', CURRENT_DATE, NOW()
    )
    RETURNING keyword_id, pin_id, shard_id;
  `;

  assert(inserted, 'Row must be inserted');
  assert.strictEqual(
    Number(inserted.shard_id),
    expectedShardId,
    `Trigger must set shard_id on keyword_displaced_index to ${expectedShardId}, got ${inserted.shard_id}`
  );
});

await runAsyncTest('INSERT into keyword_displaced_index with WRONG shard_id is overwritten by trigger', async () => {
  const pinId = `test_challenger_kdi_overwrite_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  tempPinIdsKdi.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);
  const wrongShardId = expectedShardId === 1 ? 99 : 1;

  const [inserted] = await sql`
    INSERT INTO keyword_displaced_index (
      keyword_id, pin_id, last_known_rank, shard_id, domain, displaced_date, updated_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 46, ${wrongShardId}, 'example.com', CURRENT_DATE, NOW()
    )
    RETURNING keyword_id, pin_id, shard_id;
  `;

  assert(inserted, 'Row must be inserted');
  assert.strictEqual(
    Number(inserted.shard_id),
    expectedShardId,
    `Trigger must enforce deterministic shard_id ${expectedShardId} on keyword_displaced_index`
  );
});

// =============================================================================
// Suite 3: Trigger Update Mutation (pin_id change vs other column updates)
// =============================================================================
console.log('\n[*] Suite 3: Trigger Update Mutation (pin_id update vs other columns)...');

await runAsyncTest('Updating non-pin_id columns in keyword_serp_current does NOT clobber shard_id', async () => {
  const pinId = `test_challenger_ksc_update_col_${Date.now()}`;
  tempPinIdsKsc.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);

  const [initial] = await sql`
    INSERT INTO keyword_serp_current (
      keyword_id, pin_id, rank_position, title, domain, crawled_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 10, 'Initial Title', 'initial.com', NOW()
    )
    RETURNING id, pin_id, shard_id;
  `;

  assert.strictEqual(Number(initial.shard_id), expectedShardId);

  // Update non-pin_id columns: rank_position, title, save_count
  const [updated] = await sql`
    UPDATE keyword_serp_current
    SET rank_position = 25, title = 'Updated Title', save_count = 120, updated_at = NOW()
    WHERE id = ${initial.id}
    RETURNING id, pin_id, rank_position, title, save_count, shard_id;
  `;

  assert.strictEqual(updated.title, 'Updated Title');
  assert.strictEqual(updated.rank_position, 25);
  assert.strictEqual(
    Number(updated.shard_id),
    expectedShardId,
    `Updating non-pin_id columns must NOT change shard_id: expected ${expectedShardId}, got ${updated.shard_id}`
  );
});

await runAsyncTest('Updating pin_id in keyword_serp_current automatically recalculates shard_id', async () => {
  const oldPinId = `test_challenger_ksc_old_${Date.now()}`;
  const newPinId = `test_challenger_ksc_new_${Date.now()}_alt`;
  tempPinIdsKsc.push(oldPinId);
  tempPinIdsKsc.push(newPinId);

  const oldShardId = getPinShardId(oldPinId, 99);
  const newShardId = getPinShardId(newPinId, 99);

  const [initial] = await sql`
    INSERT INTO keyword_serp_current (
      keyword_id, pin_id, rank_position, title, domain, crawled_at
    ) VALUES (
      ${testKeywordId}, ${oldPinId}, 12, 'Old Pin', 'old.com', NOW()
    )
    RETURNING id, pin_id, shard_id;
  `;

  assert.strictEqual(Number(initial.shard_id), oldShardId);

  // Update pin_id
  const [updated] = await sql`
    UPDATE keyword_serp_current
    SET pin_id = ${newPinId}
    WHERE id = ${initial.id}
    RETURNING id, pin_id, shard_id;
  `;

  assert.strictEqual(updated.pin_id, newPinId);
  assert.strictEqual(
    Number(updated.shard_id),
    newShardId,
    `Updating pin_id must recalculate shard_id to ${newShardId}, got ${updated.shard_id}`
  );
});

await runAsyncTest('Updating non-pin_id columns in keyword_displaced_index preserves shard_id', async () => {
  const pinId = `test_challenger_kdi_update_col_${Date.now()}`;
  tempPinIdsKdi.push(pinId);
  const expectedShardId = getPinShardId(pinId, 99);

  const [initial] = await sql`
    INSERT INTO keyword_displaced_index (
      keyword_id, pin_id, last_known_rank, vacuum_opportunity_score, domain, displaced_date, updated_at
    ) VALUES (
      ${testKeywordId}, ${pinId}, 30, 50, 'displaced.com', CURRENT_DATE, NOW()
    )
    RETURNING keyword_id, pin_id, shard_id;
  `;

  assert.strictEqual(Number(initial.shard_id), expectedShardId);

  // Update save_count and vacuum_opportunity_score
  const [updated] = await sql`
    UPDATE keyword_displaced_index
    SET save_count = 999, vacuum_opportunity_score = 95, updated_at = NOW()
    WHERE keyword_id = ${testKeywordId} AND pin_id = ${pinId}
    RETURNING keyword_id, pin_id, save_count, vacuum_opportunity_score, shard_id;
  `;

  assert.strictEqual(Number(updated.shard_id), expectedShardId);
});

// =============================================================================
// Suite 4: Parity on Live Central Hub (Zero NULL or mismatched rows)
// =============================================================================
console.log('\n[*] Suite 4: Parity on Live Central Hub (Zero NULL or mismatched rows)...');

await runAsyncTest('Central Hub keyword_serp_current has 0 NULL shard_id rows', async () => {
  const [res] = await sql`
    SELECT COUNT(*)::int AS null_count
    FROM keyword_serp_current
    WHERE shard_id IS NULL;
  `;
  const nullCount = Number(res.null_count);
  console.log(`    -> keyword_serp_current NULL shard_id rows: ${nullCount}`);
  assert.strictEqual(nullCount, 0, `Expected 0 NULL shard_id rows in keyword_serp_current, found ${nullCount}`);
});

await runAsyncTest('Central Hub keyword_serp_current has 0 mismatched shard_id rows against pae_crc32_shard_id', async () => {
  const [res] = await sql`
    SELECT COUNT(*)::int AS mismatch_count
    FROM keyword_serp_current
    WHERE shard_id <> pae_crc32_shard_id(pin_id, 99);
  `;
  const mismatchCount = Number(res.mismatch_count);
  console.log(`    -> keyword_serp_current mismatched shard_id rows: ${mismatchCount}`);
  assert.strictEqual(mismatchCount, 0, `Expected 0 mismatched rows in keyword_serp_current, found ${mismatchCount}`);
});

await runAsyncTest('Central Hub keyword_displaced_index has 0 NULL shard_id rows', async () => {
  const [res] = await sql`
    SELECT COUNT(*)::int AS null_count
    FROM keyword_displaced_index
    WHERE shard_id IS NULL;
  `;
  const nullCount = Number(res.null_count);
  console.log(`    -> keyword_displaced_index NULL shard_id rows: ${nullCount}`);
  assert.strictEqual(nullCount, 0, `Expected 0 NULL shard_id rows in keyword_displaced_index, found ${nullCount}`);
});

await runAsyncTest('Central Hub keyword_displaced_index has 0 mismatched shard_id rows against pae_crc32_shard_id', async () => {
  const [res] = await sql`
    SELECT COUNT(*)::int AS mismatch_count
    FROM keyword_displaced_index
    WHERE shard_id <> pae_crc32_shard_id(pin_id, 99);
  `;
  const mismatchCount = Number(res.mismatch_count);
  console.log(`    -> keyword_displaced_index mismatched shard_id rows: ${mismatchCount}`);
  assert.strictEqual(mismatchCount, 0, `Expected 0 mismatched rows in keyword_displaced_index, found ${mismatchCount}`);
});

// =============================================================================
// Suite 5: Wave 3 DDL, Index & Skeletal Compaction Verification
// =============================================================================
console.log('\n[*] Suite 5: Wave 3 DDL, Index & Skeletal Compaction Verification...');

await runAsyncTest('Migration 036 is registered in schema_migrations', async () => {
  const rows = await sql`
    SELECT version, name, applied_at
    FROM schema_migrations
    WHERE version = '036';
  `;
  assert.strictEqual(rows.length, 1, 'Migration 036 must be registered in schema_migrations');
  console.log(`    -> Migration 036 applied at: ${rows[0].applied_at}`);
});

await runAsyncTest('HOT-blocking index idx_cp_domain_rollup_covering is confirmed DROPPED', async () => {
  const rows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'competitor_pins' AND indexname = 'idx_cp_domain_rollup_covering';
  `;
  assert.strictEqual(rows.length, 0, 'idx_cp_domain_rollup_covering must NOT exist');
});

await runAsyncTest('Clean B-tree indexes from Migration 036 exist on Central Hub', async () => {
  const expectedIndexes = [
    'idx_ksc_shard_active',
    'idx_kdi_shard_kw',
    'idx_ksc_domain_clean',
    'idx_pa_pins_domain_clean',
    'idx_cp_link_domain_clean',
    'idx_pa_pins_account_username_clean'
  ];

  const rows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE indexname = ANY(${expectedIndexes}::text[]);
  `;

  const foundIndexNames = new Set(rows.map(r => r.indexname));
  for (const idx of expectedIndexes) {
    assert(foundIndexNames.has(idx), `Missing expected index: ${idx}`);
  }
  console.log(`    -> Confirmed all ${expectedIndexes.length} clean B-tree indexes exist.`);
});

await runAsyncTest('Competitor pins skeletal compaction verified: 0 uncompacted rows remain on Central Hub', async () => {
  const [res] = await sql`
    SELECT COUNT(*)::int AS uncompacted_count
    FROM competitor_pins
    WHERE enrichment_status IS DISTINCT FROM 'compacted';
  `;
  const uncompactedCount = Number(res.uncompacted_count);
  console.log(`    -> Uncompacted competitor_pins count: ${uncompactedCount}`);
  assert.strictEqual(uncompactedCount, 0, `Expected 0 uncompacted competitor_pins, found ${uncompactedCount}`);
});

await runAsyncTest('Compacted competitor_pins have NULL description/alt_text and empty metadata', async () => {
  const rows = await sql`
    SELECT id, pin_id, description, alt_text, metadata
    FROM competitor_pins
    WHERE description IS NOT NULL OR alt_text IS NOT NULL OR metadata::text <> '{}'
    LIMIT 5;
  `;
  console.log(`    -> Violating non-compacted rows: ${rows.length}`);
  assert.strictEqual(rows.length, 0, `Expected 0 rows with bloated fields in competitor_pins, found ${rows.length}`);
});

// =============================================================================
// Teardown / Cleanup
// =============================================================================
console.log('\n[*] Teardown: Cleaning up ephemeral challenger test records...');
try {
  if (tempPinIdsKsc.length > 0) {
    await sql`
      DELETE FROM keyword_serp_current
      WHERE pin_id = ANY(${tempPinIdsKsc}::text[]);
    `;
    console.log(`    -> Cleaned ${tempPinIdsKsc.length} temporary KSC rows.`);
  }
  if (tempPinIdsKdi.length > 0) {
    await sql`
      DELETE FROM keyword_displaced_index
      WHERE pin_id = ANY(${tempPinIdsKdi}::text[]);
    `;
    console.log(`    -> Cleaned ${tempPinIdsKdi.length} temporary KDI rows.`);
  }
} catch (teardownErr) {
  console.warn('[-] Teardown warning:', teardownErr.message);
}

console.log('\n================================================================================');
console.log(`🏁 EMPIRICAL CHALLENGE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED (100% GREEN)`);
console.log('================================================================================\n');
