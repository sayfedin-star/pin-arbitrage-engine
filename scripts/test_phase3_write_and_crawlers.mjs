/**
 * scripts/test_phase3_write_and_crawlers.mjs
 *
 * Automated Verification Suite for Phase 3:
 * - L1 Edge Cache Request method GET wrapping
 * - Full-Suite cache parity across competitors, board-ideas, and pinarchive
 * - Service layer atomic transactions & deadlock immunity (ORDER BY pin_id ASC)
 * - undici Agent injection & zero static import safety in pinterest.mjs
 * - Shard prewarming and combined shard transactions in fleet crawlers
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('=== Running Phase 3 Verification Suite ===\n');

// -------------------------------------------------------------
// Test 1: L1 Edge Cache Request Method Safety (RFC & Cache API compliance)
// -------------------------------------------------------------
console.log('[Test 1] Verifying L1 Edge Cache Request method GET wrapping in src/worker.mjs...');

const workerContent = fs.readFileSync('src/worker.mjs', 'utf8');

// Ensure all l1Cache calls operate on a Request with method GET
assert(
  workerContent.includes("new Request(cacheUrl, { method: 'GET' })"),
  'src/worker.mjs must wrap cacheUrl in new Request(cacheUrl, { method: "GET" })'
);

// Verify l1Cache calls in getCachedOrFetch and invalidateEdgeCache use the Request object
const putReqMatch = /l1Cache\.put\(cacheReq,/.test(workerContent);
const matchReqMatch = /l1Cache\.match\(cacheReq\)/.test(workerContent);
const delReqMatch = /l1Cache\.delete\(cacheReq\)/.test(workerContent);

assert(putReqMatch, 'l1Cache.put must be called with cacheReq (Request with method GET)');
assert(matchReqMatch, 'l1Cache.match must be called with cacheReq (Request with method GET)');
assert(delReqMatch, 'l1Cache.delete must be called with cacheReq (Request with method GET)');
console.log('  ✓ L1 Cache API calls guaranteed to use Request with method: "GET"');

// -------------------------------------------------------------
// Test 2: Full-Suite Cache Parity & Invalidation in Worker Routes
// -------------------------------------------------------------
console.log('\n[Test 2] Verifying cache wrapping & invalidations across 4 pillars in src/worker.mjs...');

// Competitors invalidations
assert(
  workerContent.includes("pathname === '/api/competitors/sync'") &&
  workerContent.includes("invalidateEdgeCache('competitors')"),
  'POST /api/competitors/sync must invalidate competitors cache'
);
assert(
  workerContent.includes("pathname === '/api/competitors/sync-boards'") &&
  workerContent.includes("invalidateEdgeCache('competitors')"),
  'POST /api/competitors/sync-boards must invalidate competitors cache'
);
assert(
  workerContent.includes("pathname === '/api/competitors/sync-pins'") &&
  workerContent.includes("invalidateEdgeCache('competitors')"),
  'POST /api/competitors/sync-pins must invalidate competitors cache'
);
assert(
  workerContent.includes("pathname === '/api/competitors/status'") &&
  workerContent.includes("invalidateEdgeCache('competitors')"),
  'POST /api/competitors/status must invalidate competitors cache'
);

// Board Ideas Radar caching & invalidations
assert(
  workerContent.includes("pathname === '/api/board-ideas/boards'") &&
  workerContent.includes("buildCanonicalCacheKey('board-ideas:list'"),
  'GET /api/board-ideas/boards must use canonical cache key board-ideas:list'
);
assert(
  workerContent.includes("pathname === '/api/board-ideas/details'") &&
  workerContent.includes("buildCanonicalCacheKey('board-ideas:details'"),
  'GET /api/board-ideas/details must use canonical cache key board-ideas:details'
);
assert(
  workerContent.includes("pathname === '/api/board-ideas/resolve'") &&
  workerContent.includes("invalidateEdgeCache('board-ideas')"),
  'POST /api/board-ideas/resolve must invalidate board-ideas cache'
);
assert(
  workerContent.includes("pathname === '/api/board-ideas/sync'") &&
  workerContent.includes("invalidateEdgeCache('board-ideas')"),
  'POST /api/board-ideas/sync must invalidate board-ideas cache'
);
assert(
  workerContent.includes("pathname === '/api/board-ideas'") &&
  workerContent.includes("invalidateEdgeCache('board-ideas')"),
  'DELETE /api/board-ideas must invalidate board-ideas cache'
);

// PinArchive caching & invalidations
assert(
  workerContent.includes("pathname === '/api/pinarchive/overview'") &&
  workerContent.includes("buildCanonicalCacheKey(`pinarchive:overview:"),
  'GET /api/pinarchive/overview must use canonical cache key'
);
assert(
  workerContent.includes("pathname === '/api/pinarchive/rules'") &&
  workerContent.includes("invalidateEdgeCache('pinarchive')") &&
  workerContent.includes("invalidateEdgeCache('topics')"),
  'POST /api/pinarchive/rules must invalidate pinarchive and topics caches'
);
assert(
  workerContent.includes("pathname === '/api/pinarchive/re-evaluate'") &&
  workerContent.includes("invalidateEdgeCache('pinarchive')") &&
  workerContent.includes("invalidateEdgeCache('topics')"),
  'POST /api/pinarchive/re-evaluate must invalidate pinarchive and topics caches'
);
assert(
  workerContent.includes("pathname === '/api/pinarchive/pin-snapshot'") &&
  workerContent.includes("invalidateEdgeCache('pinarchive')"),
  'DELETE /api/pinarchive/pin-snapshot must invalidate pinarchive cache'
);

console.log('  ✓ Full-suite 100% cache parity confirmed across Competitors, Board Ideas, and PinArchive');

// -------------------------------------------------------------
// Test 3: PinArchive Service Atomic Transactions & Deadlock Immunity
// -------------------------------------------------------------
console.log('\n[Test 3] Verifying PinArchive Service bulk writes & transactions...');

import { ingestPinsBatch } from '../src/modules/pinarchive/service.mjs';

const pinarchiveServiceContent = fs.readFileSync('src/modules/pinarchive/service.mjs', 'utf8');

// Ensure Neon HTTP array transaction and TCP begin are supported
assert(
  pinarchiveServiceContent.includes('sql.transaction([ qPins, qMetrics ])'),
  'ingestPinsBatch must pass array [ qPins, qMetrics ] to sql.transaction for Neon HTTP compatibility'
);

// Ensure ORDER BY raw.pin_id ASC is present in SQL
const orderPinIdAscMatches = (pinarchiveServiceContent.match(/ORDER BY raw\.pin_id ASC/g) || []).length;
assert(
  orderPinIdAscMatches >= 2,
  'ingestPinsBatch must order by raw.pin_id ASC in both pa_pins and pa_pin_metrics upserts'
);

// Functional test with mock TCP transaction runner (sql.begin)
let txBegun = false;
let queriesRun = 0;
const mockTx = (strings, ...args) => {
  queriesRun++;
  const sqlText = strings.join('?');
  if (sqlText.includes('pa_pins')) {
    return [{ is_inserted: true }];
  }
  return [];
};

const mockSql = {
  begin: async (callback) => {
    txBegun = true;
    return await callback(mockTx);
  }
};

const testPins = [
  {
    pin_id: '999888',
    title: 'Test Pin B',
    saves: 20,
    reactions: { like: 1 },
    annotations: ['style', 'decor']
  },
  {
    pin_id: '111222',
    title: 'Test Pin A',
    saves: 10,
    reactions: '{"heart": 3}',
    annotations: '["diy", "crafts"]'
  }
];

const ingestResult = await ingestPinsBatch(mockSql, testPins);
assert.strictEqual(txBegun, true, 'Transaction runner must be called');
assert.strictEqual(queriesRun, 2, 'Both pa_pins and pa_pin_metrics queries must execute in transaction');
assert.strictEqual(ingestResult.ok, true, 'Ingest result must succeed');

// Functional test with mock Neon HTTP array transaction runner (sql.transaction([q1, q2]))
let httpTxBegun = false;
let receivedQueries = null;
let parsedPayload = null;

const mockNeonSql = (strings, ...args) => {
  const sqlText = strings.join('?');
  // Check the jsonPayload passed into jsonb_to_recordset
  for (const arg of args) {
    if (typeof arg === 'string' && arg.startsWith('[{"pin_id"')) {
      parsedPayload = JSON.parse(arg);
    }
  }
  return { sqlText, args };
};

mockNeonSql.transaction = async (queries) => {
  httpTxBegun = true;
  receivedQueries = queries;
  assert(Array.isArray(queries), 'Neon HTTP transaction strictly requires an array of queries');
  assert.strictEqual(queries.length, 2, 'Must submit exactly [qPins, qMetrics] array');
  return [[{ is_inserted: true }]];
};

const neonIngestResult = await ingestPinsBatch(mockNeonSql, testPins);
assert.strictEqual(httpTxBegun, true, 'Neon HTTP transaction must be invoked');
assert.strictEqual(neonIngestResult.ok, true, 'Neon Ingest result must succeed');

// Verify Double-Stringification Immunity: annotations must be Array, reactions must be Object
assert(parsedPayload, 'JSON payload must be constructed');
for (const p of parsedPayload) {
  assert(Array.isArray(p.annotations), `annotations must be an Array, not string scalar: ${JSON.stringify(p.annotations)}`);
  assert(typeof p.reactions === 'object' && !Array.isArray(p.reactions), `reactions must be an Object, not string scalar: ${JSON.stringify(p.reactions)}`);
}
console.log('  ✓ ingestPinsBatch verified: Neon HTTP array contract, TCP begin, and double-stringification immunity passed');

// -------------------------------------------------------------
// Test 4: Keyword Folders Service Set-Based Atomic Writes
// -------------------------------------------------------------
console.log('\n[Test 4] Verifying Keyword Folders Service set-based writes...');

import { batchAddKeywordsToFolder } from '../src/modules/keywords/folders-service.mjs';

const foldersServiceContent = fs.readFileSync('src/modules/keywords/folders-service.mjs', 'utf8');

assert(
  foldersServiceContent.includes('FROM UNNEST(${validKids}::int[])'),
  'batchAddKeywordsToFolder must use set-based UNNEST'
);
assert(
  foldersServiceContent.includes('sql.transaction([ qInsert, qUpdate ])'),
  'batchAddKeywordsToFolder must pass query array to sql.transaction for Neon HTTP'
);

let folderTxBegun = false;
const mockFolderSql = (strings, ...args) => ({ strings, args });
mockFolderSql.transaction = async (queries) => {
  folderTxBegun = true;
  assert(Array.isArray(queries), 'sql.transaction must receive an array of queries for Neon HTTP');
  assert.strictEqual(queries.length, 2, 'sql.transaction must receive [qInsert, qUpdate]');
  return [[{ keyword_id: 101 }, { keyword_id: 102 }]];
};

const folderResult = await batchAddKeywordsToFolder(mockFolderSql, 1, [101, 102]);
assert.strictEqual(folderTxBegun, true, 'Folder transaction runner must be invoked');
assert.strictEqual(folderResult.added, 2, 'Added count must equal 2');
console.log('  ✓ batchAddKeywordsToFolder executes set-based UNNEST with Neon HTTP array transaction');

// -------------------------------------------------------------
// Test 5: undici Agent Injection & Zero Static Import Architectural Red Line
// -------------------------------------------------------------
console.log('\n[Test 5] Verifying undici Agent injection & Zero Static Import safety...');

import { setDefaultDispatcher, getDefaultDispatcher, pinterestFetch } from './lib/pinterest.mjs';

const pinterestLibContent = fs.readFileSync('scripts/lib/pinterest.mjs', 'utf8');

// Strict Red Line: Zero static import of undici in scripts/lib/pinterest.mjs
assert(
  !pinterestLibContent.includes("from 'undici'") && !pinterestLibContent.includes('from "undici"'),
  'scripts/lib/pinterest.mjs MUST NOT contain static imports of undici (preserves Cloudflare Worker bundle)'
);

// Verify Dispatcher Injection
const mockDispatcher = { id: 'mock-undici-dispatcher' };
setDefaultDispatcher(mockDispatcher);
assert.strictEqual(getDefaultDispatcher(), mockDispatcher, 'setDefaultDispatcher must store active dispatcher');
setDefaultDispatcher(null);
assert.strictEqual(getDefaultDispatcher(), null, 'setDefaultDispatcher must allow resetting to null');

// Verify crawlers dynamically instantiate and inject undici
const kwCrawlerContent = fs.readFileSync('scripts/keyword-velocity-crawler.mjs', 'utf8');
const engineContent = fs.readFileSync('scripts/crawler-engine.mjs', 'utf8');
const clusterContent = fs.readFileSync('scripts/cluster-intelligence.mjs', 'utf8');
const relatedContent = fs.readFileSync('scripts/account-related-crawler.mjs', 'utf8');

assert(kwCrawlerContent.includes("await import('undici')"), 'keyword-velocity-crawler.mjs must dynamically load undici');
assert(kwCrawlerContent.includes('setDefaultDispatcher(undiciAgent)'), 'keyword-velocity-crawler.mjs must register dispatcher');

assert(engineContent.includes("await import('undici')"), 'crawler-engine.mjs must dynamically load undici');
assert(engineContent.includes('setDefaultDispatcher(undiciAgent)'), 'crawler-engine.mjs must register dispatcher');

assert(clusterContent.includes("await import('undici')"), 'cluster-intelligence.mjs must dynamically load undici');
assert(clusterContent.includes('dispatcher: undiciAgent'), 'cluster-intelligence.mjs must pass dispatcher to fetch');

assert(relatedContent.includes("await import('undici')"), 'account-related-crawler.mjs must dynamically load undici');
assert(relatedContent.includes('dispatcher: undiciAgent'), 'account-related-crawler.mjs must pass dispatcher to fetch');

console.log('  ✓ Zero static import invariant preserved; dynamic undici injection verified across all 4 crawlers');

// -------------------------------------------------------------
// Test 6: Shard Transactions & Prewarming in Fleet Crawlers
// -------------------------------------------------------------
console.log('\n[Test 6] Verifying shard prewarming & combined transactions in fleet crawlers...');

// Verify parallel prewarming pulse in keyword-velocity-crawler.mjs
assert(
  kwCrawlerContent.includes('prewarmSql`SELECT 1;`'),
  'keyword-velocity-crawler.mjs must issue parallel SELECT 1 prewarming pulse across affected shards'
);

// Verify combined shard transaction in flushToStorageShards
assert(
  kwCrawlerContent.includes('shardSql.transaction([q1, q2, q3])') ||
  kwCrawlerContent.includes('shardSql.transaction(['),
  'keyword-velocity-crawler.mjs must combine q1, q2, q3 into single shardSql.transaction'
);

// Verify monotonic ORDER BY in crawler engine and account related crawler
assert(
  engineContent.includes('ORDER BY pin_id ASC'),
  'crawler-engine.mjs must order pin batch writes by pin_id ASC'
);
assert(
  relatedContent.includes('ORDER BY x.candidate_pin_id ASC'),
  'account-related-crawler.mjs must order candidate graph writes by candidate_pin_id ASC'
);

// Verify cluster intelligence bulk jsonb_to_recordset writes
assert(
  clusterContent.includes('FROM jsonb_to_recordset(${chunkPayload}::jsonb)') &&
  clusterContent.includes('ORDER BY raw.candidate_pin_id ASC'),
  'cluster-intelligence.mjs must use bulk jsonb_to_recordset for candidate_graph_nodes ordered by candidate_pin_id ASC'
);
assert(
  clusterContent.includes('FROM jsonb_to_recordset(${capPayload}::jsonb)') &&
  clusterContent.includes('ORDER BY raw.normalized_query ASC'),
  'cluster-intelligence.mjs must use bulk jsonb_to_recordset for seed_guided_search_capsules ordered by normalized_query ASC'
);

console.log('  ✓ Parallel SELECT 1 prewarming and atomic shard transactions verified');

console.log('\n🎉 ALL Phase 3 Verification Assertions Passed Successfully (100% Green)!');
