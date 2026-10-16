/**
 * Comprehensive Test Suite for Cloudflare Edge Modernization:
 * - Cloudflare Hyperdrive connection pooling & graceful degradation
 * - Workers KV (fleet:shards_map & circuit:pinterest:429)
 * - Cloudflare D1 Database (search_autocomplete_index & edge_campaign_folders)
 * - /api/health Edge Diagnostics
 */

import worker, {
  checkPinterestCircuitBreaker,
  tripPinterestCircuitBreaker,
  syncFolderToD1,
  deleteFolderFromD1,
  syncKeywordToD1,
  syncKeywordsCatalogToD1,
  evictKeywordsCatalogFromD1
} from '../src/worker.mjs';
import { resolveShardConnection, getFleetShardsMap, preloadNeonRegistry } from '../src/modules/sharding/fleet-router.mjs';

function createMockKV() {
  const store = new Map();
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

function createMockD1() {
  const tables = {
    search_autocomplete_index: new Map(),
    edge_campaign_folders: new Map(),
    edge_keywords_catalog: new Map(),
    edge_keywords_meta: new Map()
  };

  return {
    async batch(stmts) {
      if (Array.isArray(stmts)) {
        for (const s of stmts) {
          if (s && typeof s.run === 'function') await s.run();
        }
      }
      return [];
    },
    prepare(sqlQuery) {
      return {
        _bound: [],
        bind(...args) {
          this._bound = args;
          return this;
        },
        async first() {
          const res = await this.all();
          return res.results[0] || null;
        },
        async all() {
          const q = sqlQuery.trim();
          if (q.includes('FROM search_autocomplete_index')) {
            const prefix = (this._bound[0] || '').replace(/%$/, '').toLowerCase();
            const results = [];
            for (const [kw, row] of tables.search_autocomplete_index.entries()) {
              if (kw.toLowerCase().startsWith(prefix)) {
                results.push({
                  keyword: row.keyword,
                  search_volume: row.search_volume,
                  pin_count: row.pin_count
                });
              }
            }
            return { results: results.slice(0, 10), success: true };
          }

          if (q.includes('FROM edge_campaign_folders')) {
            if (q.includes('WHERE id = ?')) {
              const id = String(this._bound[0]);
              const row = tables.edge_campaign_folders.get(id);
              return { results: row ? [row] : [], success: true };
            }
            // All folders
            const list = Array.from(tables.edge_campaign_folders.values());
            list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            return { results: list, success: true };
          }

          if (q.includes('FROM edge_keywords_catalog')) {
            const list = Array.from(tables.edge_keywords_catalog.values());
            if (q.includes('WHERE LOWER(keyword) LIKE ?')) {
              const pattern = String(this._bound[0] || '').replace(/%/g, '').toLowerCase();
              const filtered = list.filter(k => k.keyword.toLowerCase().includes(pattern));
              return { results: filtered, success: true };
            }
            return { results: list, success: true };
          }

          if (q.includes('FROM edge_keywords_meta')) {
            const key = this._bound[0] || 'catalog_status';
            const row = tables.edge_keywords_meta.get(key);
            return { results: row ? [{ value: row.value }] : [], success: true };
          }

          return { results: [], success: true };
        },
        async run() {
          const q = sqlQuery.trim();
          if (q.includes('INTO edge_campaign_folders')) {
            const [id, name, color, description, itemCount, updatedAt] = this._bound;
            tables.edge_campaign_folders.set(String(id), {
              id: String(id),
              name,
              color,
              description,
              item_count: itemCount,
              updated_at: updatedAt
            });
            return { success: true };
          }
          if (q.includes('DELETE FROM edge_campaign_folders WHERE id = ?')) {
            const id = String(this._bound[0]);
            tables.edge_campaign_folders.delete(id);
            return { success: true };
          }
          if (q.includes('INTO search_autocomplete_index')) {
            const [kw, searchVolume, monthlyGrowth, pinCount, lastSyncedAt] = this._bound;
            tables.search_autocomplete_index.set(String(kw), {
              keyword: String(kw),
              search_volume: searchVolume,
              monthly_growth: monthlyGrowth,
              pin_count: pinCount,
              last_synced_at: lastSyncedAt
            });
            return { success: true };
          }
          if (q.includes('INTO edge_keywords_catalog')) {
            const [
              id, keyword, category, targetPinCount, refreshInterval,
              lastCrawledAt, topPinId, topPinTitle, topPinImage,
              avgVelocity, isActive, tags, metadata,
              createdAt, updatedAt, crawlPagesLimit, inspectionMode,
              canonicalKeyword, snapshotsCount, totalPinsCount, folders
            ] = this._bound;
            tables.edge_keywords_catalog.set(Number(id), {
              id: Number(id),
              keyword: String(keyword),
              category: String(category),
              target_pin_count: targetPinCount,
              refresh_interval_hours: refreshInterval,
              last_crawled_at: lastCrawledAt,
              top_pin_id: topPinId,
              top_pin_title: topPinTitle,
              top_pin_image: topPinImage,
              avg_daily_velocity: avgVelocity,
              is_active: isActive,
              tags,
              metadata,
              created_at: createdAt,
              updated_at: updatedAt,
              crawl_pages_limit: crawlPagesLimit,
              inspection_mode: inspectionMode,
              canonical_keyword: canonicalKeyword,
              snapshots_count: snapshotsCount,
              total_pins_count: totalPinsCount,
              folders
            });
            return { success: true };
          }
          if (q.includes('DELETE FROM edge_keywords_catalog WHERE id NOT IN')) {
            const match = q.match(/NOT IN \(([^)]+)\)/);
            if (match) {
              const keepIds = new Set(match[1].split(',').map(s => Number(s.trim())));
              for (const [id] of tables.edge_keywords_catalog.entries()) {
                if (!keepIds.has(Number(id))) {
                  tables.edge_keywords_catalog.delete(id);
                }
              }
            }
            return { success: true };
          }
          if (q.includes('DELETE FROM edge_keywords_catalog WHERE id = ?')) {
            const id = Number(this._bound[0]);
            tables.edge_keywords_catalog.delete(id);
            return { success: true };
          }
          if (q.trim() === 'DELETE FROM edge_keywords_catalog') {
            tables.edge_keywords_catalog.clear();
            return { success: true };
          }
          if (q.includes('INTO edge_keywords_meta')) {
            const [key, val] = this._bound;
            tables.edge_keywords_meta.set(String(key), { value: val });
            return { success: true };
          }
          if (q.includes('DELETE FROM edge_keywords_meta')) {
            tables.edge_keywords_meta.clear();
            return { success: true };
          }
          return { success: true };
        }
      };
    },
    _tables: tables
  };
}

function createMockSql() {
  const mockFn = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (query.includes('SELECT 1 as alive')) {
      return [{ alive: 1 }];
    }
    if (query.includes('FROM neon_projects_registry')) {
      return [
        {
          id: 1,
          project_id: 'shard-01',
          project_name: 'pin-arbitrage-shard-01',
          database_url: 'postgres://user:pass@ep-shard-01.aws.neon.tech/neondb',
          status: 'active',
          assigned_shards: [1]
        },
        {
          id: 2,
          project_id: 'shard-02',
          project_name: 'pin-arbitrage-shard-02',
          database_url: 'postgres://user:pass@ep-shard-02.aws.neon.tech/neondb',
          status: 'active',
          assigned_shards: [2]
        }
      ];
    }
    if (query.includes('FROM tracked_keywords') || query.includes('FROM keywords')) {
      return [
        { id: 1, keyword: 'sourdough bread', category: 'General', target_pin_count: 50, is_active: true, search_volume: 45000, pin_count: 120 },
        { id: 2, keyword: 'sourdough starter', category: 'General', target_pin_count: 50, is_active: true, search_volume: 32000, pin_count: 95 }
      ];
    }
    return [];
  };
  return mockFn;
}

async function runModernizationTests() {
  console.log('='.repeat(80));
  console.log('   CLOUDFLARE EDGE MODERNIZATION AUDIT & ZERO-DEFECT TEST SUITE');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 0;

  function assert(desc, condition, details = '') {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} - ${details}`);
    }
  }

  // =========================================================================
  // 1. HYPERDRIVE & HEALTH CHECK
  // =========================================================================
  console.log('\n[AXIS 1] Cloudflare Hyperdrive Acceleration & Edge Diagnostics (/api/health)');

  // 1.1 Hyperdrive Enabled
  {
    const mockSql = createMockSql();
    const env = {
      HYPERDRIVE: { connectionString: 'postgres://user:pass@hyperdrive.cloudflare.net/neondb' },
      PIN_ENGINE_KV: createMockKV(),
      PIN_D1_DB: createMockD1(),
      SQL_CLIENT: mockSql
    };
    const req = new Request('https://worker.test/api/health');
    const res = await worker.fetch(req, env);
    const data = await res.json();
    assert(
      'Health check returns HTTP 200 with Hyperdrive active flag',
      res.status === 200 && data.status === 'healthy' && data.hyperdrive_accelerated === true && data.hyperdrive === 'active',
      JSON.stringify(data)
    );
    assert(
      'Health check flags KV and D1 status correctly',
      data.kv_configured === true && data.kv === 'connected' && data.d1_configured === true && data.d1 === 'connected',
      JSON.stringify(data)
    );
  }

  // 1.2 Graceful Fallback when Hyperdrive is undefined
  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://user:pass@ep-pooler.aws.neon.tech/neondb',
      PIN_ENGINE_KV: null,
      PIN_D1_DB: null,
      SQL_CLIENT: mockSql
    };
    const req = new Request('https://worker.test/api/health');
    const res = await worker.fetch(req, env);
    const data = await res.json();
    assert(
      'Health check falls back gracefully when Hyperdrive is missing (hyperdrive_accelerated = false)',
      res.status === 200 && data.status === 'healthy' && data.hyperdrive_accelerated === false && data.hyperdrive === 'fallback',
      JSON.stringify(data)
    );
    assert(
      'Health check accurately detects unconfigured KV and D1',
      data.kv_configured === false && data.kv === 'unconfigured' && data.d1_configured === false && data.d1 === 'unconfigured',
      JSON.stringify(data)
    );
  }

  // =========================================================================
  // 2. WORKERS KV: 1MS SHARD ROUTING (fleet:shards_map)
  // =========================================================================
  console.log('\n[AXIS 2] Workers KV Shard Routing (fleet:shards_map)');

  {
    const kv = createMockKV();
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      PIN_ENGINE_KV: kv,
      SQL_CLIENT: mockSql
    };

    // 2.1 First cold request should populate KV from Neon Hub
    let cachedBefore = await kv.get('fleet:shards_map', { type: 'json' });
    assert('KV starts without fleet:shards_map', cachedBefore === null);

    const shardsFromHelper = await getFleetShardsMap(env, mockSql);
    assert(
      'getFleetShardsMap loads from Neon Hub and populates KV',
      Array.isArray(shardsFromHelper) && shardsFromHelper.length === 2
    );

    const cachedAfter = await kv.get('fleet:shards_map', { type: 'json' });
    assert(
      'fleet:shards_map is now populated in KV',
      Array.isArray(cachedAfter) && cachedAfter.length === 2 && cachedAfter[0].project_id === 'shard-01'
    );

    // 2.2 Subsequent lookup reads from KV without calling Hub SQL
    let sqlCalled = false;
    const trackingSql = async () => {
      sqlCalled = true;
      return [];
    };
    const shardsFromKV = await getFleetShardsMap(env, trackingSql);
    assert(
      'getFleetShardsMap reads directly from KV with 0 SQL queries',
      Array.isArray(shardsFromKV) && shardsFromKV.length === 2 && sqlCalled === false
    );

    // 2.3 Shard routing via resolveShardConnection with KV
    const shardConn = await resolveShardConnection({ hubSql: trackingSql, shardId: 1, env });
    assert(
      'resolveShardConnection resolves shard using KV mapping without SQL query',
      typeof shardConn === 'function' && sqlCalled === false
    );
  }

  // =========================================================================
  // 3. WORKERS KV: CIRCUIT BREAKER (circuit:pinterest:429)
  // =========================================================================
  console.log('\n[AXIS 3] Edge Circuit Breaker for Pinterest HTTP 429 (circuit:pinterest:429)');

  {
    const kv = createMockKV();
    const env = {
      PIN_ENGINE_KV: kv,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: createMockSql()
    };

    // 3.1 Verify circuit breaker is initially CLOSED / inactive
    const initialCb = await checkPinterestCircuitBreaker(env);
    assert('Circuit breaker is initially null/inactive', initialCb === null);

    // 3.2 Trip circuit breaker
    await tripPinterestCircuitBreaker(env, 'HTTP 429 Too Many Requests', 900);
    const activeCb = await checkPinterestCircuitBreaker(env);
    assert(
      'Circuit breaker trips OPEN with cooldown active',
      activeCb && activeCb.active === true && activeCb.remaining_seconds > 0 && activeCb.reason.includes('429')
    );

    // 3.3 Mutating crawler endpoints reject immediately with HTTP 429 and Retry-After
    const reqCrawl = new Request('https://worker.test/api/crawl', { method: 'POST' });
    const resCrawl = await worker.fetch(reqCrawl, env);
    assert(
      'POST /api/crawl immediately rejects with HTTP 429 and Retry-After: 900 when circuit breaker is active',
      resCrawl.status === 429 && resCrawl.headers.get('Retry-After') === '900' && resCrawl.headers.get('X-Circuit-Breaker') === 'OPEN'
    );
    const crawlBody = await resCrawl.json();
    assert(
      'POST /api/crawl returns structured PINTEREST_RATE_LIMITED payload',
      crawlBody.error === 'PINTEREST_RATE_LIMITED' && crawlBody.retry_after === 900
    );

    const reqSync = new Request('https://worker.test/api/keywords/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'sourdough-bread' })
    });
    const resSync = await worker.fetch(reqSync, env);
    assert(
      'POST /api/keywords/sync immediately rejects with HTTP 429 when circuit breaker is active',
      resSync.status === 429 && resSync.headers.get('Retry-After') === '900'
    );
  }

  // =========================================================================
  // 4. CLOUDFLARE D1 DATABASE: AUTOCOMPLETE INDEX
  // =========================================================================
  console.log('\n[AXIS 4] Cloudflare D1 Database: Autocomplete & Folder Offloading');

  {
    const d1 = createMockD1();
    const mockSql = createMockSql();
    const env = {
      PIN_D1_DB: d1,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

    // 4.1 Sync keywords into D1 autocomplete table
    await syncKeywordToD1(env, {
      keyword: 'sourdough bread',
      search_volume: 85000,
      monthly_growth: 14.5,
      pin_count: 340
    });
    await syncKeywordToD1(env, {
      keyword: 'sourdough pizza crust',
      search_volume: 42000,
      monthly_growth: 8.2,
      pin_count: 190
    });

    // 4.2 Query /api/search/autocomplete?q=sour and /api/keywords/autocomplete?q=sour
    const reqAutoc = new Request('https://worker.test/api/search/autocomplete?q=sour');
    const resAutoc = await worker.fetch(reqAutoc, env);
    const dataAutoc = await resAutoc.json();
    assert(
      'GET /api/search/autocomplete?q=sour queries D1 edge database (source: d1_edge)',
      resAutoc.status === 200 && dataAutoc.source === 'd1_edge' && dataAutoc.results?.length === 2,
      JSON.stringify(dataAutoc)
    );
    assert(
      'Autocomplete results return correct schema (keyword, search_volume, pin_count)',
      dataAutoc.results[0].keyword === 'sourdough bread' && dataAutoc.results[0].search_volume === 85000
    );

    const reqAutocAlias = new Request('https://worker.test/api/keywords/autocomplete?q=sour');
    const resAutocAlias = await worker.fetch(reqAutocAlias, env);
    const dataAutocAlias = await resAutocAlias.json();
    assert(
      'GET /api/keywords/autocomplete alias queries D1 edge database (source: d1_edge)',
      resAutocAlias.status === 200 && dataAutocAlias.source === 'd1_edge' && dataAutocAlias.results?.length === 2
    );

    // 4.3 Autocomplete fallback to Neon when D1 is unconfigured
    const envNoD1 = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };
    const reqFallback = new Request('https://worker.test/api/search/autocomplete?q=sour');
    const resFallback = await worker.fetch(reqFallback, envNoD1);
    const dataFallback = await resFallback.json();
    assert(
      'GET /api/search/autocomplete falls back cleanly to Neon Hub when D1 is missing',
      resFallback.status === 200 && dataFallback.source === 'neon_hub' && dataFallback.results?.length > 0
    );
  }

  // =========================================================================
  // 5. CLOUDFLARE D1 DATABASE: CAMPAIGN FOLDERS
  // =========================================================================
  console.log('\n[AXIS 5] Cloudflare D1 Database: Campaign Folders Sub-5ms Reads & Sync');

  {
    const d1 = createMockD1();
    const env = {
      PIN_D1_DB: d1,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: createMockSql()
    };

    // 5.1 Sync folder into D1
    await syncFolderToD1(env, {
      id: '101',
      name: 'Autumn Baking Campaign',
      color: '#d97706',
      description: 'Top artisan bread & pastry keywords',
      item_count: 24,
      updated_at: new Date().toISOString()
    });

    // 5.2 Read single folder from D1
    const reqF1 = new Request('https://worker.test/api/folders/101');
    const resF1 = await worker.fetch(reqF1, env);
    const dataF1 = await resF1.json();
    assert(
      'GET /api/folders/:id serves directly from D1 edge database (source: d1_edge)',
      resF1.status === 200 && dataF1.source === 'd1_edge' && dataF1.folder?.name === 'Autumn Baking Campaign'
    );

    const reqCF1 = new Request('https://worker.test/api/campaign-folders/101');
    const resCF1 = await worker.fetch(reqCF1, env);
    const dataCF1 = await resCF1.json();
    assert(
      'GET /api/campaign-folders/:id alias serves directly from D1 edge database (source: d1_edge)',
      resCF1.status === 200 && dataCF1.source === 'd1_edge' && dataCF1.folder?.name === 'Autumn Baking Campaign'
    );

    // 5.3 List folders from D1
    const reqFList = new Request('https://worker.test/api/folders');
    const resFList = await worker.fetch(reqFList, env);
    const dataFList = await resFList.json();
    assert(
      'GET /api/folders list serves directly from D1 edge database (source: d1_edge)',
      resFList.status === 200 && dataFList.source === 'd1_edge' && dataFList.folders?.length === 1
    );

    const reqCFList = new Request('https://worker.test/api/campaign-folders');
    const resCFList = await worker.fetch(reqCFList, env);
    const dataCFList = await resCFList.json();
    assert(
      'GET /api/campaign-folders alias serves directly from D1 edge database (source: d1_edge)',
      resCFList.status === 200 && dataCFList.source === 'd1_edge' && dataCFList.folders?.length === 1
    );

    // 5.4 Delete folder from D1
    await deleteFolderFromD1(env, '101');
    const reqAfterDel = new Request('https://worker.test/api/folders');
    const resAfterDel = await worker.fetch(reqAfterDel, env);
    const dataAfterDel = await resAfterDel.json();
    assert(
      'Folder successfully removed from D1 edge storage',
      dataAfterDel.folders?.length === 0 || dataAfterDel.source !== 'd1_edge'
    );
  }

  // =========================================================================
  // 6. CLOUDFLARE D1 DATABASE: KEYWORDS CATALOG EDGE READS & AUTO-WARMING
  // =========================================================================
  console.log('\n[AXIS 6] Cloudflare D1 Database: Keywords Catalog Sub-5ms Reads & Auto-Warming');

  {
    const d1 = createMockD1();
    const mockSql = createMockSql();
    const env = {
      PIN_D1_DB: d1,
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

    // 6.1 Cold-Start: when D1 is empty, /api/keywords falls back cleanly to Neon Hub
    const reqCold = new Request('https://worker.test/api/keywords');
    const resCold = await worker.fetch(reqCold, env);
    const dataCold = await resCold.json();
    assert(
      'GET /api/keywords on cold D1 falls back to Neon Hub (source: neon_hub)',
      resCold.status === 200 && dataCold.source === 'neon_hub'
    );

    // 6.2 Sync keywords catalog into D1 with full catalog warming
    await syncKeywordsCatalogToD1(env, [
      {
        id: 201,
        keyword: 'slow cooker dinner recipes',
        category: 'Food & Drink',
        target_pin_count: 50,
        refresh_interval_hours: 24,
        top_pin_title: 'Easy Slow Cooker Dinners',
        avg_daily_velocity: '12.4',
        is_active: true,
        folders: [{ id: 1, name: 'Crockpot', color: '#06b6d4' }]
      },
      {
        id: 202,
        keyword: 'healthy winter meal prep',
        category: 'Health',
        target_pin_count: 50,
        refresh_interval_hours: 24,
        top_pin_title: 'Meal Prep Ideas for Winter',
        avg_daily_velocity: '8.1',
        is_active: true,
        folders: []
      }
    ], { isFullCatalog: true });

    // 6.3 Read keywords from D1 edge database (sub-5ms)
    const reqWarm = new Request('https://worker.test/api/keywords');
    const resWarm = await worker.fetch(reqWarm, env);
    const dataWarm = await resWarm.json();
    assert(
      'GET /api/keywords serves directly from D1 edge database (source: d1_edge)',
      resWarm.status === 200 && dataWarm.source === 'd1_edge' && dataWarm.keywords?.length >= 2,
      JSON.stringify(dataWarm)
    );

    // 6.4 Search filtering in D1 edge catalog
    const reqSearch = new Request('https://worker.test/api/keywords?search=cooker');
    const resSearch = await worker.fetch(reqSearch, env);
    const dataSearch = await resSearch.json();
    assert(
      'GET /api/keywords?search=cooker filters correctly at D1 edge',
      resSearch.status === 200 && dataSearch.source === 'd1_edge' && dataSearch.keywords?.length === 1 && dataSearch.keywords[0].keyword === 'slow cooker dinner recipes'
    );

    // 6.5 Eviction from D1 edge catalog
    await evictKeywordsCatalogFromD1(env);
    const reqAfterEvict = new Request('https://worker.test/api/keywords');
    const resAfterEvict = await worker.fetch(reqAfterEvict, env);
    const dataAfterEvict = await resAfterEvict.json();
    assert(
      'GET /api/keywords after eviction triggers auto-warming fallback to Neon Hub',
      resAfterEvict.status === 200 && dataAfterEvict.source === 'neon_hub'
    );

    // 6.6 Snowflake Numeric Pin ID Enforcement (/pins/:pin_id & /api/pins/:pin_id)
    const validSnowflakeId = '275704808435366101';
    const reqPinHtml = new Request(`https://worker.test/pins/${validSnowflakeId}`);
    const resPinHtml = await worker.fetch(reqPinHtml, env);
    const htmlText = await resPinHtml.text();
    assert(
      'GET /pins/:pin_id serves valid numeric Snowflake Pin ID cleanly',
      resPinHtml.status === 200 && htmlText.includes(validSnowflakeId)
    );

    const reqPinApi = new Request(`https://worker.test/api/pins/${validSnowflakeId}`);
    const resPinApi = await worker.fetch(reqPinApi, env);
    assert(
      'GET /api/pins/:pin_id accepts numeric Snowflake ID without 400 INVALID_PIN_ID',
      resPinApi.status !== 400
    );

    const e1Token = 'e1_AfqPShwoOyKyIt-VSPHlFYBo0DOJ2QWF9JGGnTNs6nihpSiLo6sl';
    const reqE1Api = new Request(`https://worker.test/api/pins/${e1Token}`);
    const resE1Api = await worker.fetch(reqE1Api, env);
    assert(
      'GET /api/pins/:pin_id strictly rejects non-numeric e1_ tokens with 400 INVALID_PIN_ID',
      resE1Api.status === 400
    );
  }

  // =========================================================================
  // SUMMARY SCORECARD
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`MODERNIZATION AUDIT SCORECARD: ${passed} / ${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('='.repeat(80));

  if (passed === total) {
    console.log('>>> ZERO-DEFECT SIGN-OFF: ALL CLOUDFLARE EDGE MODERNIZATION CHECKS PASSED 100%! <<<\n');
  } else {
    throw new Error(`Modernization audit failed with ${total - passed} failures.`);
  }
}

runModernizationTests().catch(err => {
  console.error('\n[-] Modernization Audit Failed:', err);
  process.exit(1);
});
