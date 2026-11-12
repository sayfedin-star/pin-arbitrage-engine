/**
 * Comprehensive Test Suite for Pure Neon Architecture & Edge Modernization:
 * - Pure Neon Serverless Postgres health & diagnostics (/api/health)
 * - Deterministic unified shard resolution (resolveShardConnection)
 * - Circuit breaker for Pinterest HTTP 429
 * - Autocomplete and folders routing
 * - Snowflake numeric pin ID enforcement
 */

import worker, {
  checkPinterestCircuitBreaker,
  tripPinterestCircuitBreaker
} from '../src/worker.mjs';
import { resolveShardConnection, isUnifiedPostgres } from '../src/modules/sharding/fleet-router.mjs';

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
    if (query.includes('FROM campaign_folders')) {
      return [
        { id: '101', name: 'Autumn Baking Campaign', color: '#d97706', description: 'Top artisan bread & pastry keywords', item_count: 24, updated_at: new Date().toISOString() }
      ];
    }
    return [];
  };
  return mockFn;
}

async function runModernizationTests() {
  console.log('='.repeat(80));
  console.log('   PURE NEON SERVERLESS POSTGRES & EDGE MODERNIZATION ZERO-DEFECT TEST SUITE');
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
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  // =========================================================================
  // 1. PURE NEON HEALTH CHECK (/api/health)
  // =========================================================================
  console.log('\n[AXIS 1] Pure Neon Serverless Postgres Diagnostics (/api/health)');

  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://user:pass@ep-pooler.aws.neon.tech/neondb',
      SQL_CLIENT: mockSql
    };
    const req = new Request('https://worker.test/api/health');
    const res = await worker.fetch(req, env);
    const data = await res.json();
    assert(
      'Health check returns HTTP 200 with healthy status',
      res.status === 200 && data.status === 'healthy',
      JSON.stringify(data)
    );
    assert(
      'Health check confirms unified_postgres topology and direct Neon connection',
      data.topology === 'unified_postgres' && data.database === 'connected' && data.direct_neon_configured === true,
      JSON.stringify(data)
    );
  }

  // =========================================================================
  // 2. UNIFIED POSTGRES SHARD ROUTING
  // =========================================================================
  console.log('\n[AXIS 2] Unified Postgres Shard Routing Parity');

  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

    assert('isUnifiedPostgres defaults to true in pure Neon environment', isUnifiedPostgres(env) === true);

    const shardConn = await resolveShardConnection({ hubSql: mockSql, shardId: 1, env });
    assert(
      'resolveShardConnection resolves shard cleanly to unified Neon SQL connection',
      typeof shardConn === 'function'
    );
  }

  // =========================================================================
  // 3. CIRCUIT BREAKER (circuit:pinterest:429)
  // =========================================================================
  console.log('\n[AXIS 3] Edge Circuit Breaker for Pinterest HTTP 429');

  {
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: createMockSql()
    };

    // 3.1 Initial state
    const initialCb = await checkPinterestCircuitBreaker(env);
    assert('Circuit breaker is initially null/inactive', initialCb === null);

    // 3.2 Trip circuit breaker
    await tripPinterestCircuitBreaker(env, 'HTTP 429 Too Many Requests', 900);
    const activeCb = await checkPinterestCircuitBreaker(env);
    assert(
      'Circuit breaker trips OPEN with cooldown active',
      activeCb && activeCb.active === true && activeCb.remaining_seconds > 0 && activeCb.reason.includes('429')
    );

    // 3.3 Mutating crawler endpoints reject immediately with HTTP 429
    const reqCrawl = new Request('https://worker.test/api/crawl', { method: 'POST' });
    const resCrawl = await worker.fetch(reqCrawl, env);
    assert(
      'POST /api/crawl rejects with HTTP 429 when circuit breaker is active',
      resCrawl.status === 429 && resCrawl.headers.get('Retry-After') === '900'
    );

    const reqSync = new Request('https://worker.test/api/keywords/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'sourdough-bread' })
    });
    const resSync = await worker.fetch(reqSync, env);
    assert(
      'POST /api/keywords/sync rejects with HTTP 429 when circuit breaker is active',
      resSync.status === 429 && resSync.headers.get('Retry-After') === '900'
    );
  }

  // =========================================================================
  // 4. AUTOCOMPLETE RESOLUTION
  // =========================================================================
  console.log('\n[AXIS 4] Autocomplete Query Resolution via Pure Neon Hub');

  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

    const reqFallback = new Request('https://worker.test/api/search/autocomplete?q=sour');
    const resFallback = await worker.fetch(reqFallback, env);
    const dataFallback = await resFallback.json();
    assert(
      'GET /api/search/autocomplete resolves cleanly from Neon Hub',
      resFallback.status === 200 && dataFallback.source === 'neon_hub' && dataFallback.results?.length > 0
    );

    const reqAlias = new Request('https://worker.test/api/keywords/autocomplete?q=sour');
    const resAlias = await worker.fetch(reqAlias, env);
    const dataAlias = await resAlias.json();
    assert(
      'GET /api/keywords/autocomplete alias resolves cleanly from Neon Hub',
      resAlias.status === 200 && dataAlias.source === 'neon_hub'
    );
  }

  // =========================================================================
  // 5. CAMPAIGN FOLDERS DIRECT SERVING
  // =========================================================================
  console.log('\n[AXIS 5] Campaign Folders Serving via Neon Hub');

  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

    const reqFList = new Request('https://worker.test/api/folders');
    const resFList = await worker.fetch(reqFList, env);
    assert(
      'GET /api/folders list responds with HTTP 200',
      resFList.status === 200
    );

    const reqCFList = new Request('https://worker.test/api/folders/by-keyword?keyword_id=1');
    const resCFList = await worker.fetch(reqCFList, env);
    assert(
      'GET /api/folders/by-keyword unified endpoint responds with HTTP 200',
      resCFList.status === 200
    );
  }

  // =========================================================================
  // 6. SNOWFLAKE NUMERIC PIN ID ENFORCEMENT
  // =========================================================================
  console.log('\n[AXIS 6] Snowflake Numeric Pin ID Enforcement & Route Safety');

  {
    const mockSql = createMockSql();
    const env = {
      DATABASE_URL: 'postgres://dummy@neon.tech/db',
      SQL_CLIENT: mockSql
    };

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
    console.log('>>> ZERO-DEFECT SIGN-OFF: ALL PURE NEON MODERNIZATION CHECKS PASSED 100%! <<<\n');
  } else {
    throw new Error(`Modernization audit failed with ${total - passed} failures.`);
  }
}

runModernizationTests().catch(err => {
  console.error('\n[-] Modernization Audit Failed:', err);
  process.exit(1);
});
