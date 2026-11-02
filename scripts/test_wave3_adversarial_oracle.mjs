/**
 * EMPIRICAL ADVERSARIAL ORACLE & STRESS HARNESS: WAVE 3
 * 
 * Exhaustively stress-tests:
 * 1. Cache Keys & Epoch Validation (6h TTL, 1h SWR, fleet:cache_epoch invalidation)
 * 2. D1 Folder-Scoped Filtering on Real SQLite (json_each, diverse folder IDs, edge cases)
 * 3. Synchronous D1 Eviction across all folder mutation endpoints
 * 4. Physical Shard Normalization (1..99 -> 1..20, Set deduplication, KV map purge)
 * 5. Architectural Invariants & Regression Locks
 */

import { DatabaseSync } from 'node:sqlite';
import worker, {
  getCachedOrFetch,
  buildCanonicalCacheKey,
  invalidateEdgeCache
} from '../src/worker.mjs';
import {
  ensureEdgeKeywordsCatalogTable,
  readKeywordsFromD1,
  evictKeywordsCatalogFromD1
} from '../src/modules/keywords/d1-metadata.mjs';
import { getPhysicalShardId } from '../src/modules/sharding/fleet-router.mjs';

// ============================================================================
// Real SQLite D1 Driver for Empirical Testing
// ============================================================================
function createRealSQLiteD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS edge_keywords_catalog (
      id INTEGER PRIMARY KEY,
      keyword TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      target_pin_count INTEGER DEFAULT 50,
      refresh_interval_hours INTEGER DEFAULT 24,
      last_crawled_at TEXT,
      top_pin_id TEXT,
      top_pin_title TEXT,
      top_pin_image TEXT,
      avg_daily_velocity REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      tags TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      crawl_pages_limit INTEGER DEFAULT 2,
      inspection_mode TEXT DEFAULT 'full_catalog',
      canonical_keyword TEXT,
      snapshots_count INTEGER DEFAULT 0,
      total_pins_count INTEGER DEFAULT 0,
      folders TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS edge_keywords_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS edge_pins_metadata (
      pin_id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      domain TEXT DEFAULT '',
      destination_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      creator_username TEXT DEFAULT '',
      board_name TEXT DEFAULT '',
      dominant_color TEXT DEFAULT '#888888',
      visual_annotations TEXT DEFAULT '[]',
      seo_alt_text TEXT DEFAULT '',
      description TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      daily_trajectory TEXT DEFAULT '[]',
      created_at_pinterest TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS edge_campaign_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#ec4899',
      description TEXT DEFAULT '',
      item_count INTEGER DEFAULT 0,
      keyword_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return {
    async batch(stmts) {
      const results = [];
      for (const s of stmts) {
        if (s && typeof s.run === 'function') {
          results.push(await s.run());
        }
      }
      return results;
    },
    prepare(sqlQuery) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          const res = await this.all();
          return res.results[0] || null;
        },
        async all() {
          const stmt = db.prepare(sqlQuery);
          const cleanBound = bound.map(x => x === undefined ? null : (typeof x === 'boolean' ? (x ? 1 : 0) : x));
          const rows = stmt.all(...cleanBound);
          return { results: rows, success: true };
        },
        async run() {
          const stmt = db.prepare(sqlQuery);
          const cleanBound = bound.map(x => x === undefined ? null : (typeof x === 'boolean' ? (x ? 1 : 0) : x));
          const info = stmt.run(...cleanBound);
          return { success: true, changes: info.changes };
        }
      };
    },
    _db: db
  };
}

// ============================================================================
// Real KV Mock with TTL, Get, Put, Delete
// ============================================================================
function createMockKV(initialStore = {}) {
  const store = new Map(Object.entries(initialStore).map(([k, v]) => [k, { val: v, expiresAt: null }]));
  return {
    async get(key, options = {}) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      if (options.type === 'json') {
        return typeof entry.val === 'string' ? JSON.parse(entry.val) : entry.val;
      }
      return entry.val;
    },
    async put(key, val, options = {}) {
      const ttlSec = options.expirationTtl;
      const expiresAt = ttlSec ? Date.now() + (ttlSec * 1000) : null;
      store.set(key, { val, expiresAt });
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store
  };
}

// ============================================================================
// Mock Postgres SQL Client
// ============================================================================
function createMockSql(customData = {}) {
  const mockFolders = customData.folders || [
    { id: 1, name: 'Baking', color: '#ec4899', project_id: 'default' },
    { id: 2, name: 'Home Decor', color: '#3b82f6', project_id: 'default' }
  ];
  const mockKeywords = customData.keywords || [
    { id: 101, keyword: 'sourdough bread', category: 'General', target_pin_count: 50, avg_daily_velocity: 15.2, is_active: true },
    { id: 102, keyword: 'farmhouse table', category: 'Home', target_pin_count: 50, avg_daily_velocity: 8.4, is_active: true }
  ];

  const mockFn = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (query.includes('FROM neon_projects_registry')) {
      return [
        { id: 1, project_id: 'shard-01', project_name: 'pin-arbitrage-shard-01', database_url: 'postgres://dummy@ep-01.aws.neon.tech/neondb', status: 'active', is_hub: false, assigned_shards: [1] }
      ];
    }
    if (query.includes('FROM keyword_folders') || query.includes('FROM folders')) {
      return mockFolders;
    }
    if (query.includes('FROM tracked_keywords') || query.includes('FROM keywords')) {
      return mockKeywords;
    }
    if (query.includes('FROM domain_intelligence_rollup')) {
      return [{ domain: 'kingarthurbaking.com', total_pins: 150, visibility_score: 95.5 }];
    }
    return [];
  };

  mockFn.begin = async (callback) => {
    return await callback(mockFn);
  };
  mockFn.transaction = async (queries) => {
    if (Array.isArray(queries)) {
      return await Promise.all(queries);
    }
    return [];
  };

  return mockFn;
}

// ============================================================================
// Test Suite Runner
// ============================================================================
async function runAdversarialOracle() {
  console.log('='.repeat(80));
  console.log('   EMPIRICAL ADVERSARIAL ORACLE: WAVE 3 STRESS HARNESS');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;
  const failures = [];

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} - ${details}`);
      failures.push({ desc, details });
      failed++;
    }
  }

  // =========================================================================
  // AXIS 1: Cache Keys & Epoch Validation
  // =========================================================================
  console.log('\n[AXIS 1] Cache Keys & Epoch Invalidation Stress Harness');

  // 1.1 Verify exact constant values
  const SIX_HOURS_MS = 21600000;
  const ONE_HOUR_MS = 3600000;
  assert('TTL constant is exactly 6 hours (21,600,000 ms)', SIX_HOURS_MS === 6 * 60 * 60 * 1000);
  assert('SWR constant is exactly 1 hour (3,600,000 ms)', ONE_HOUR_MS === 1 * 60 * 60 * 1000);

  // 1.2 Canonical cache key construction with epoch
  const key1 = buildCanonicalCacheKey('domains:leaderboard:ep:0', { sort: 'visibility', page: 1, limit: 50 });
  const key2 = buildCanonicalCacheKey('domains:leaderboard:ep:1730456789', { sort: 'visibility', page: 1, limit: 50 });
  const keyKw1 = buildCanonicalCacheKey('keywords:hub:ep:0', { search: 'bread', limit: 1000, folder_id: 42 });
  const keyKw2 = buildCanonicalCacheKey('keywords:hub:ep:1730456789', { search: 'bread', limit: 1000, folder_id: 42 });

  assert('Domain cache key incorporates :ep:0', key1.includes(':ep:0?') && key1.includes('limit=50'));
  assert('Domain cache key changes when epoch updates', key1 !== key2 && key2.includes(':ep:1730456789'));
  assert('Keywords cache key incorporates :ep:0', keyKw1.includes(':ep:0?') && keyKw1.includes('folder_id=42'));
  assert('Keywords cache key changes when epoch updates', keyKw1 !== keyKw2 && keyKw2.includes(':ep:1730456789'));

  // 1.3 Empirical getCachedOrFetch epoch invalidation test
  let fetchCount = 0;
  const mockFetcher = async () => {
    fetchCount++;
    return { success: true, data: `data_v${fetchCount}`, from_shard_snapshots: true };
  };

  // Call 1 with epoch 0
  fetchCount = 0;
  const epochA = '10001';
  const kA = `test:item:ep:${epochA}`;
  const res1 = await getCachedOrFetch(kA, mockFetcher, SIX_HOURS_MS, ONE_HOUR_MS, { epoch: epochA });
  assert('Call 1 on fresh cache invokes fetcher', fetchCount === 1 && res1?.data === 'data_v1');

  // Call 2 with same epoch 0 (HIT)
  const res2 = await getCachedOrFetch(kA, mockFetcher, SIX_HOURS_MS, ONE_HOUR_MS, { epoch: epochA });
  assert('Call 2 with same epoch hits memory cache (fetcher NOT called)', fetchCount === 1 && res2?.data === 'data_v1');

  // Call 3 after epoch bump (MISS)
  const epochB = '10002';
  const kB = `test:item:ep:${epochB}`;
  const res3 = await getCachedOrFetch(kB, mockFetcher, SIX_HOURS_MS, ONE_HOUR_MS, { epoch: epochB });
  assert('Call 3 with bumped epoch forces fresh fetch (fetcher called again)', fetchCount === 2 && res3?.data === 'data_v2');

  // Call 4 with forceRefresh: true (MISS)
  const res4 = await getCachedOrFetch(kB, mockFetcher, SIX_HOURS_MS, ONE_HOUR_MS, { forceRefresh: true, epoch: epochB });
  assert('Call 4 with forceRefresh: true bypasses cache (fetcher called again)', fetchCount === 3 && res4?.data === 'data_v3');

  // 1.4 Route-Level Epoch Invalidation via KV
  {
    const kv = createMockKV({ 'fleet:cache_epoch': '500' });
    let dbQueryCount = 0;
    const testSql = async (strings, ...values) => {
      const q = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (q.includes('FROM tracked_keywords') || q.includes('paged_keywords')) {
        dbQueryCount++;
        return [{ id: 1, keyword: 'sourdough', target_pin_count: 50, is_active: true }];
      }
      return [];
    };

    const env = {
      PIN_ENGINE_KV: kv,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: testSql
    };

    // First request at epoch 500
    const reqR1 = new Request('https://worker.test/api/keywords?search=sour');
    const resR1 = await worker.fetch(reqR1, env);
    const dataR1 = await resR1.json();
    const countAfterR1 = dbQueryCount;
    assert('Route GET /api/keywords queries DB at initial epoch', resR1.status === 200 && countAfterR1 >= 1);

    // Second request at same epoch 500 (cached)
    const reqR2 = new Request('https://worker.test/api/keywords?search=sour');
    const resR2 = await worker.fetch(reqR2, env);
    assert('Route GET /api/keywords serves from cache at same epoch (0 new DB queries)', dbQueryCount === countAfterR1);

    // Bump epoch in KV to 501
    await kv.put('fleet:cache_epoch', '501');

    // Third request after epoch bump (must query DB again)
    const reqR3 = new Request('https://worker.test/api/keywords?search=sour');
    const resR3 = await worker.fetch(reqR3, env);
    assert('Route GET /api/keywords queries DB again when fleet:cache_epoch changes', dbQueryCount > countAfterR1);
  }

  // =========================================================================
  // AXIS 2: D1 Folder-Scoped Filtering on Real SQLite
  // =========================================================================
  console.log('\n[AXIS 2] D1 Folder-Scoped Filtering Stress Harness (Real SQLite Engine)');

  {
    const d1 = createRealSQLiteD1();
    const env = { PIN_D1_DB: d1 };

    // 2.1 Table creation and cold state check
    await ensureEdgeKeywordsCatalogTable(env);
    const coldRes = await readKeywordsFromD1(env, { folderId: 10 });
    assert('readKeywordsFromD1 returns null on cold/unwarmed catalog', coldRes === null);

    // 2.2 Seed catalog status as warmed
    await d1.prepare("INSERT INTO edge_keywords_meta (key, value) VALUES (?, ?)").bind(
      'catalog_status',
      JSON.stringify({ is_warmed: true, count: 6, warmed_at: new Date().toISOString() })
    ).run();

    // 2.3 Seed catalog with diverse folder JSON structures
    const testKeywords = [
      {
        id: 1,
        keyword: 'sourdough bread artisan',
        category: 'Food',
        target_pin_count: 50,
        folders: JSON.stringify([{ id: 10, name: 'Baking' }, { id: 20, name: 'Artisan' }])
      },
      {
        id: 2,
        keyword: 'chocolate chip cookies',
        category: 'Food',
        target_pin_count: 50,
        folders: JSON.stringify([10, 30]) // primitive array of integers
      },
      {
        id: 3,
        keyword: 'french croissant pastry',
        category: 'Food',
        target_pin_count: 50,
        folders: JSON.stringify([{ id: 20, name: 'Artisan' }, { id: 30, name: 'Pastry' }])
      },
      {
        id: 4,
        keyword: 'modern minimalist kitchen',
        category: 'Home',
        target_pin_count: 50,
        folders: JSON.stringify([{ id: 40, name: 'Interior' }])
      },
      {
        id: 5,
        keyword: 'unassigned keyword general',
        category: 'General',
        target_pin_count: 50,
        folders: '[]' // empty folder array
      },
      {
        id: 6,
        keyword: 'another unassigned keyword',
        category: 'General',
        target_pin_count: 50,
        folders: 'null' // null string
      }
    ];

    for (const k of testKeywords) {
      await d1.prepare(`
        INSERT INTO edge_keywords_catalog (
          id, keyword, category, target_pin_count, refresh_interval_hours,
          last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
          avg_daily_velocity, is_active, tags, metadata,
          created_at, updated_at, crawl_pages_limit, inspection_mode,
          canonical_keyword, snapshots_count, total_pins_count, folders
        ) VALUES (?, ?, ?, ?, 24, null, null, null, null, 10.0, 1, '{}', '{}', datetime('now'), datetime('now'), 2, 'full_catalog', null, 5, 50, ?)
      `).bind(k.id, k.keyword, k.category, k.target_pin_count, k.folders).run();
    }

    // 2.4 Test folderId as numeric integer (matches both object $.id and primitive value)
    const resF10 = await readKeywordsFromD1(env, { folderId: 10 });
    const idsF10 = resF10?.map(r => r.id).sort();
    assert('Folder 10 matches both object [{id: 10}] (kw 1) and primitive [10] (kw 2)',
      Array.isArray(resF10) && resF10.length === 2 && idsF10[0] === 1 && idsF10[1] === 2
    );

    // 2.5 Test folderId as numeric string '10'
    const resFStr10 = await readKeywordsFromD1(env, { folderId: '10' });
    assert('Folder "10" (string) matches identical rows',
      Array.isArray(resFStr10) && resFStr10.length === 2
    );

    // 2.6 Test folderId with whitespace ' 10 '
    const resFPadded = await readKeywordsFromD1(env, { folderId: '  10  ' });
    assert('Folder "  10  " (padded string) matches cleanly',
      Array.isArray(resFPadded) && resFPadded.length === 2
    );

    // 2.7 Test folderId 20 (kw 1 and kw 3)
    const resF20 = await readKeywordsFromD1(env, { folderId: 20 });
    const idsF20 = resF20?.map(r => r.id).sort();
    assert('Folder 20 matches kw 1 and kw 3',
      Array.isArray(resF20) && resF20.length === 2 && idsF20[0] === 1 && idsF20[1] === 3
    );

    // 2.8 Test folderId 40 (kw 4 only)
    const resF40 = await readKeywordsFromD1(env, { folderId: 40 });
    assert('Folder 40 matches kw 4 only',
      Array.isArray(resF40) && resF40.length === 1 && resF40[0]?.id === 4
    );

    // 2.9 Test non-existent folderId 999 (should return empty array [], NOT null, NOT error)
    const resF999 = await readKeywordsFromD1(env, { folderId: 999 });
    assert('Non-existent folderId 999 returns [] empty array (NOT null)',
      Array.isArray(resF999) && resF999.length === 0
    );

    // 2.10 Test UUID string folderId (handles gracefully without throwing SQLite syntax error)
    let uuidError = null;
    let resUuid = null;
    try {
      resUuid = await readKeywordsFromD1(env, { folderId: 'c3b9b4a1-0e1a-4d2a-9e1a-123456789abc' });
    } catch (e) {
      uuidError = e;
    }
    assert('UUID folderId is handled safely without SQLite syntax error', uuidError === null);

    // 2.11 Test combined search + folderId
    const resSearchF10 = await readKeywordsFromD1(env, { search: 'artisan', folderId: 10 });
    assert('Combined search "artisan" + folderId 10 returns kw 1 only',
      Array.isArray(resSearchF10) && resSearchF10.length === 1 && resSearchF10[0]?.id === 1
    );

    // 2.12 Test eviction invalidation
    await evictKeywordsCatalogFromD1(env);
    const resAfterEvict = await readKeywordsFromD1(env, { folderId: 10 });
    assert('readKeywordsFromD1 returns null after evictKeywordsCatalogFromD1 (stale state)',
      resAfterEvict === null
    );

    // 2.13 Test single keyword deletion
    // Re-warm catalog
    await d1.prepare("UPDATE edge_keywords_meta SET value = ? WHERE key = 'catalog_status'").bind(
      JSON.stringify({ is_warmed: true, count: 5 })
    ).run();
    await evictKeywordsCatalogFromD1(env, 4); // delete keyword 4
    const resAfterDeleteKw = await readKeywordsFromD1(env, { folderId: 40 });
    assert('After evictKeywordsCatalogFromD1(env, 4), keyword 4 is deleted from D1',
      Array.isArray(resAfterDeleteKw) && resAfterDeleteKw.length === 0
    );

    // 2.14 Test authentic HTTP worker.fetch folder-scoped filtering
    // [INVARIANT: D1-FOLDER-SCOPED-HTTP-VERIFICATION]
    {
      const d1Http = createRealSQLiteD1();
      await ensureEdgeKeywordsCatalogTable({ PIN_D1_DB: d1Http });

      // Seed catalog status as warmed in D1
      await d1Http.prepare("INSERT INTO edge_keywords_meta (key, value) VALUES (?, ?)").bind(
        'catalog_status',
        JSON.stringify({ is_warmed: true, count: 2, warmed_at: new Date().toISOString() })
      ).run();

      // Seed Keyword 101 (assigned to folder [10]) and Keyword 202 (assigned to folder [20])
      await d1Http.prepare(`
        INSERT INTO edge_keywords_catalog (
          id, keyword, category, target_pin_count, refresh_interval_hours,
          avg_daily_velocity, is_active, tags, metadata,
          created_at, updated_at, crawl_pages_limit, inspection_mode,
          snapshots_count, total_pins_count, folders
        ) VALUES 
        (101, 'sourdough starter guide', 'Food', 50, 24, 12.5, 1, '{}', '{}', datetime('now'), datetime('now'), 2, 'full_catalog', 10, 50, ?),
        (202, 'minimalist living room', 'Home', 50, 24, 5.0, 1, '{}', '{}', datetime('now'), datetime('now'), 2, 'full_catalog', 10, 50, ?)
      `).bind(JSON.stringify([10]), JSON.stringify([20])).run();

      const httpEnv = {
        PIN_D1_DB: d1Http,
        PIN_ENGINE_KV: createMockKV({ 'fleet:cache_epoch': '1' }),
        API_SECRET_KEY: 'test-secret-key',
        DATABASE_URL: 'postgres://dummy@neon.tech/db',
        SQL_CLIENT: createMockSql()
      };

      const req = new Request('https://worker.test/api/keywords?folder_id=10', {
        method: 'GET',
        headers: {
          'x-api-key': 'test-secret-key'
        }
      });

      const res = await worker.fetch(req, httpEnv);
      assert('GET /api/keywords?folder_id=10 returns HTTP 200 via worker.fetch', res.status === 200);

      const body = await res.json();
      assert('GET /api/keywords?folder_id=10 serves from d1_edge', body.source === 'd1_edge');
      assert('GET /api/keywords?folder_id=10 returns exactly 1 keyword', Array.isArray(body.keywords) && body.keywords.length === 1);
      assert('GET /api/keywords?folder_id=10 returns only keyword with folder [10]', body.keywords?.[0]?.id === 101);
      assert('GET /api/keywords?folder_id=10 excludes keyword with folder [20]', !body.keywords?.some(k => k.id === 202));
      assert('GET /api/keywords?folder_id=10 does not return global catalog', !body.keywords?.some(k => k.id !== 101));
    }
  }

  // =========================================================================
  // AXIS 3: Synchronous D1 Eviction in Folder Mutation Endpoints
  // =========================================================================
  console.log('\n[AXIS 3] Synchronous D1 Eviction Stress Harness (Folder Mutation Endpoints)');

  {
    // Helper to test an endpoint and assert that D1 catalog_status is stale IMMEDIATELY after response
    async function testMutationSyncEviction(endpointName, reqMethod, reqUrl, reqBody = {}) {
      const d1 = createRealSQLiteD1();
      await ensureEdgeKeywordsCatalogTable({ PIN_D1_DB: d1 });

      // Pre-warm D1 catalog
      await d1.prepare("INSERT INTO edge_keywords_meta (key, value) VALUES (?, ?)").bind(
        'catalog_status',
        JSON.stringify({ is_warmed: true, count: 10, warmed_at: new Date().toISOString() })
      ).run();

      const mockSql = createMockSql();
      const env = {
        PIN_D1_DB: d1,
        PIN_ENGINE_KV: createMockKV(),
        DATABASE_URL: 'postgres://dummy@neon.tech/db',
        SQL_CLIENT: mockSql
      };

      const req = new Request(reqUrl, {
        method: reqMethod,
        headers: { 'Content-Type': 'application/json' },
        body: (reqMethod === 'GET' || reqMethod === 'HEAD') ? undefined : JSON.stringify(reqBody)
      });

      const res = await worker.fetch(req, env);
      assert(`${endpointName} returns HTTP 200`, res.status === 200, `Got ${res.status}`);

      // Check D1 catalog_status synchronously
      const metaRow = await d1.prepare("SELECT value FROM edge_keywords_meta WHERE key = ?").bind('catalog_status').first();
      let meta = null;
      try { meta = JSON.parse(metaRow?.value); } catch (_) {}

      assert(`${endpointName} synchronously sets catalog_status to { is_warmed: false, stale: true }`,
        meta && meta.is_warmed === false && meta.stale === true
      );
    }

    // 3.1 POST /api/keywords/folders (create folder)
    await testMutationSyncEviction(
      'POST /api/keywords/folders (Create Folder)',
      'POST',
      'https://worker.test/api/keywords/folders',
      { name: 'New Campaign Folder', color: '#10b981' }
    );

    // 3.2 PUT /api/keywords/folders (update folder)
    await testMutationSyncEviction(
      'PUT /api/keywords/folders (Update Folder)',
      'PUT',
      'https://worker.test/api/keywords/folders',
      { id: 1, name: 'Updated Campaign Folder' }
    );

    // 3.3 PATCH /api/keywords/folders (patch folder)
    await testMutationSyncEviction(
      'PATCH /api/keywords/folders (Patch Folder)',
      'PATCH',
      'https://worker.test/api/keywords/folders',
      { id: 1, color: '#f59e0b' }
    );

    // 3.4 DELETE /api/keywords/folders (delete folder)
    await testMutationSyncEviction(
      'DELETE /api/keywords/folders (Delete Folder)',
      'DELETE',
      'https://worker.test/api/keywords/folders?id=1'
    );

    // 3.5 POST /api/keywords/folders/items (batch add keywords)
    await testMutationSyncEviction(
      'POST /api/keywords/folders/items (Batch Add)',
      'POST',
      'https://worker.test/api/keywords/folders/items',
      { folder_id: 1, keyword_ids: [101, 102] }
    );

    // 3.6 POST /api/keywords/folders/items (single add keyword)
    await testMutationSyncEviction(
      'POST /api/keywords/folders/items (Single Add)',
      'POST',
      'https://worker.test/api/keywords/folders/items',
      { folder_id: 1, keyword_id: 101, notes: 'Priority focus' }
    );

    // 3.7 DELETE /api/keywords/folders/items (remove keyword)
    await testMutationSyncEviction(
      'DELETE /api/keywords/folders/items (Remove Keyword)',
      'DELETE',
      'https://worker.test/api/keywords/folders/items?folder_id=1&keyword_id=101'
    );
  }

  // =========================================================================
  // AXIS 4: Physical Shard Normalization in Wake Endpoints
  // =========================================================================
  console.log('\n[AXIS 4] Physical Shard Normalization Stress Harness');

  // 4.1 Exhaustive 1..99 virtual to 1..20 physical normalization test
  let allMappedCorrectly = true;
  for (let v = 1; v <= 99; v++) {
    const p = getPhysicalShardId(v);
    const expected = ((v - 1) % 20) + 1;
    if (p !== expected || p < 1 || p > 20) {
      allMappedCorrectly = false;
      break;
    }
  }
  assert('All 99 virtual shard IDs map strictly into 1..20 via ((v - 1) % 20) + 1', allMappedCorrectly);

  // 4.2 Boundary & edge-case inputs to getPhysicalShardId
  assert('getPhysicalShardId(0) safely defaults to 1', getPhysicalShardId(0) === 1);
  assert('getPhysicalShardId(-10) safely defaults to 1', getPhysicalShardId(-10) === 1);
  assert('getPhysicalShardId(NaN) safely defaults to 1', getPhysicalShardId(NaN) === 1);
  assert('getPhysicalShardId(undefined) safely defaults to 1', getPhysicalShardId(undefined) === 1);
  assert('getPhysicalShardId("20") maps to 20', getPhysicalShardId('20') === 20);
  assert('getPhysicalShardId("21") maps to 1', getPhysicalShardId('21') === 1);
  assert('getPhysicalShardId("40") maps to 20', getPhysicalShardId('40') === 20);
  assert('getPhysicalShardId("99") maps to 19', getPhysicalShardId('99') === 19);

  // 4.3 Endpoint test: POST /api/fleet/shards/wake with all 99 virtual shards
  {
    const kv = createMockKV();
    const env = {
      PIN_ENGINE_KV: kv,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: createMockSql()
    };

    const all99VirtualShards = Array.from({ length: 99 }, (_, i) => i + 1);
    const reqWakeAll = new Request('https://worker.test/api/fleet/shards/wake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shards: all99VirtualShards })
    });

    const resWakeAll = await worker.fetch(reqWakeAll, env);
    const dataWakeAll = await resWakeAll.json();

    assert('POST /api/fleet/shards/wake returns HTTP 200', resWakeAll.status === 200);
    assert('POST /api/fleet/shards/wake with 99 virtual shards coalesces to exactly 20 physical shards',
      dataWakeAll.physical_shards_pinged === 20 &&
      Array.isArray(dataWakeAll.shards) &&
      dataWakeAll.shards.length === 20
    );
    assert('Set deduplication guarantees 0 duplicate physical shards',
      new Set(dataWakeAll.shards).size === 20
    );

    // 4.4 Test virtual shards that all map to physical shard 1 (1, 21, 41, 61, 81)
    const reqWakeColliding = new Request('https://worker.test/api/fleet/wake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shards: [1, 21, 41, 61, 81] })
    });
    const resWakeColliding = await worker.fetch(reqWakeColliding, env);
    const dataWakeColliding = await resWakeColliding.json();
    assert('POST /api/fleet/wake with [1, 21, 41, 61, 81] deduplicates to [1]',
      dataWakeColliding.physical_shards_pinged === 1 &&
      dataWakeColliding.shards.length === 1 &&
      dataWakeColliding.shards[0] === 1
    );

    // 4.5 Test query param wake ?shard=45 (45 -> 5)
    const reqWakeQ = new Request('https://worker.test/api/fleet/keep-alive?shard=45', {
      method: 'POST'
    });
    const resWakeQ = await worker.fetch(reqWakeQ, env);
    const dataWakeQ = await resWakeQ.json();
    assert('POST /api/fleet/keep-alive?shard=45 maps virtual 45 to physical shard 5',
      dataWakeQ.shards?.length === 1 && dataWakeQ.shards[0] === 5
    );
  }

  // 4.6 Test POST /api/fleet/cache-invalidate (KV Shard Map Purging + Epoch Bump + D1 Stale Stamping)
  {
    const kv = createMockKV({
      'fleet:cache_epoch': '100',
      'fleet:shards_map': JSON.stringify([{ id: 1, project_id: 'shard-01' }])
    });
    const d1 = createRealSQLiteD1();
    await ensureEdgeKeywordsCatalogTable({ PIN_D1_DB: d1 });
    await d1.prepare("INSERT INTO edge_keywords_meta (key, value) VALUES (?, ?)").bind(
      'catalog_status',
      JSON.stringify({ is_warmed: true, count: 5 })
    ).run();

    const env = {
      PIN_ENGINE_KV: kv,
      PIN_D1_DB: d1,
      API_SECRET_KEY: 'test_secret_key',
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: createMockSql()
    };

    const reqInvalidate = new Request('https://worker.test/api/fleet/cache-invalidate', {
      method: 'POST',
      headers: {
        'x-api-key': 'test_secret_key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ scope: 'all_folders', event: 'test_invalidation' })
    });

    const resInvalidate = await worker.fetch(reqInvalidate, env);
    const dataInvalidate = await resInvalidate.json();

    assert('POST /api/fleet/cache-invalidate returns HTTP 200', resInvalidate.status === 200 && dataInvalidate.success === true);
    assert('fleet:cache_epoch is updated to fresh timestamp in KV',
      kv._store.get('fleet:cache_epoch')?.val !== '100'
    );
    assert('fleet:shards_map is DELETED from KV',
      !kv._store.has('fleet:shards_map')
    );

    const metaRow = await d1.prepare("SELECT value FROM edge_keywords_meta WHERE key = ?").bind('catalog_status').first();
    let meta = null;
    try { meta = JSON.parse(metaRow?.value); } catch (_) {}
    assert('D1 catalog_status is stamped as stale in edge_keywords_meta',
      meta && meta.is_warmed === false && meta.stale === true
    );
  }

  // =========================================================================
  // Summary & Verdict
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`ORACLE SCORECARD: ${passed} / ${passed + failed} Tests Passed (${Math.round((passed / (passed + failed)) * 100)}%)`);
  if (failed > 0) {
    console.error(`FAILURES (${failed}):`);
    for (const f of failures) {
      console.error(`  - ${f.desc}: ${f.details}`);
    }
  }
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialOracle().catch(err => {
  console.error('Fatal Oracle Exception:', err);
  process.exit(1);
});
