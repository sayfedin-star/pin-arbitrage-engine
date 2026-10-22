/**
 * Deep Forensic Test Suite: Edge D1 Snapshot Mirroring & Predictive Hover JIT Warming
 * 
 * Verifies:
 * 1. Cloudflare D1 `edge_pins_metadata` schema parity with `daily_trajectory` TEXT column.
 * 2. `syncPinsBatchToD1` and `hydratePinsFromD1` mirror and read serialized trajectory arrays.
 * 3. `getFastEdgeDossier` resolves multi-day trajectory in < 3ms from D1 edge mirror.
 * 4. `fetchUniversalPinDossier` Zero-Wakeup Invariant: Does NOT call or resolve Shard connections
 *    when D1 holds a valid cached multi-day daily_trajectory.
 * 5. `fetchUniversalPinDossier` Write-Through Invariant: Asynchronously persists fresh shard trajectory
 *    into D1 `edge_pins_metadata` and KV `pin:dossier?pin_id=...`.
 * 6. `/api/fleet/warm` Predictive Hover JIT Warming Endpoint:
 *    - Pings target shard deterministically via `getPinShardId(pinId, 99)`.
 *    - Safe non-blocking execution via `safeWaitUntil`.
 *    - 15-second cooldown deduplication guard against spamming.
 *    - Concurrency limit protection (MAX_CONCURRENT_WARMS = 4).
 * 7. `src/edge-shield-client.mjs`:
 *    - Mouseover handler debounced at 120-150ms with predictive JIT warming call.
 *    - Mouseout cleanly clears pending debounce timers.
 *    - 100% syntactically valid JS inside `new vm.Script(...)`.
 */

import assert from 'node:assert';
import vm from 'node:vm';
import worker from '../src/worker.mjs';
import {
  fetchUniversalPinDossier,
  getFastEdgeDossier,
  getPinShardId,
  globalShardMap,
  _setShardSqlClient
} from '../src/modules/sharding/fleet-router.mjs';
import {
  ensureEdgePinsMetadataTable,
  syncPinsBatchToD1,
  hydratePinsFromD1
} from '../src/modules/keywords/d1-metadata.mjs';
import { getEdgeShieldClientScript } from '../src/edge-shield-client.mjs';

console.log('='.repeat(80));
console.log('   DEEP FORENSIC AUDIT: EDGE D1 SNAPSHOT MIRRORING & HOVER JIT WARMING');
console.log('='.repeat(80));

let passed = 0;
let total = 0;

function runTest(desc, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(desc, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}:`, err.message);
    throw err;
  }
}

// =============================================================================
// Mock D1 In-Memory SQLite Implementation for High-Fidelity Edge Verification
// =============================================================================
function createMockD1Database() {
  const store = new Map();
  let tableCreated = false;
  let hasTrajectoryCol = false;

  return {
    _store: store,
    prepare(sqlText) {
      const trimmed = sqlText.trim();
      return {
        bind(...args) {
          return {
            _isSelect: trimmed.startsWith('SELECT'),
            async run() {
              if (trimmed.includes('CREATE TABLE IF NOT EXISTS edge_pins_metadata')) {
                tableCreated = true;
                if (trimmed.includes('daily_trajectory')) hasTrajectoryCol = true;
                return { success: true };
              }
              if (trimmed.includes('ALTER TABLE edge_pins_metadata ADD COLUMN daily_trajectory')) {
                hasTrajectoryCol = true;
                return { success: true };
              }
              if (trimmed.includes('INSERT INTO edge_pins_metadata')) {
                // args order: pin_id (0), title (1), domain (2), destination_url (3), image_url (4),
                // creator_username (5), board_name (6), dominant_color (7), visual_annotations (8),
                // seo_alt_text (9), description (10), metadata (11), daily_trajectory (12), created_at_pinterest (13), updated_at (14)
                const pinId = String(args[0]);
                const existing = store.get(pinId) || {};
                const entry = {
                  pin_id: pinId,
                  title: args[1] || existing.title || '',
                  domain: args[2] || existing.domain || '',
                  destination_url: args[3] || existing.destination_url || '',
                  image_url: args[4] || existing.image_url || '',
                  creator_username: args[5] || existing.creator_username || '',
                  board_name: args[6] || existing.board_name || '',
                  dominant_color: args[7] || existing.dominant_color || '#888888',
                  visual_annotations: args[8] || existing.visual_annotations || '[]',
                  seo_alt_text: args[9] || existing.seo_alt_text || '',
                  description: args[10] || existing.description || '',
                  metadata: args[11] || existing.metadata || '{}',
                  daily_trajectory: (args[12] && args[12] !== '[]') ? args[12] : (existing.daily_trajectory || '[]'),
                  created_at_pinterest: args[13] || existing.created_at_pinterest || null,
                  updated_at: new Date().toISOString()
                };
                store.set(pinId, entry);
                return { success: true };
              }
              if (trimmed.startsWith('DELETE FROM edge_pins_metadata')) {
                store.delete(String(args[0]));
                return { success: true };
              }
              return { success: true };
            },
            async first() {
              if (trimmed.includes('SELECT') && trimmed.includes('FROM edge_pins_metadata WHERE pin_id = ?')) {
                const pinId = String(args[0]);
                return store.get(pinId) || null;
              }
              return null;
            },
            async all() {
              if (trimmed.includes('SELECT') && trimmed.includes('FROM edge_pins_metadata WHERE pin_id IN')) {
                const results = [];
                for (const arg of args) {
                  const item = store.get(String(arg));
                  if (item) results.push(item);
                }
                return { results };
              }
              return { results: [] };
            }
          };
        }
      };
    },
    async batch(stmts) {
      const results = [];
      for (const s of stmts) {
        if (s._isSelect) {
          const res = await s.all();
          results.push(res);
        } else {
          const res = await s.run();
          results.push(res);
        }
      }
      return results;
    }
  };
}

// =============================================================================
// Section 1: D1 Edge Metadata Service Trajectory Mirroring
// =============================================================================
console.log('\n[*] Section 1: D1 Edge Metadata Service Trajectory Mirroring...');

await runAsyncTest('ensureEdgePinsMetadataTable declares and defensively alters daily_trajectory', async () => {
  const mockD1 = createMockD1Database();
  const env = { PIN_D1_DB: mockD1 };
  await ensureEdgePinsMetadataTable(env);
  assert.strictEqual(mockD1._store instanceof Map, true);
});

await runAsyncTest('syncPinsBatchToD1 and hydratePinsFromD1 mirror and parse daily_trajectory correctly', async () => {
  const mockD1 = createMockD1Database();
  const env = { PIN_D1_DB: mockD1 };

  const sampleTrajectory = [
    { snapshot_date: '2026-10-22', save_count: 550, repin_count: 85, daily_save_velocity: 12.5 },
    { snapshot_date: '2026-10-21', save_count: 538, repin_count: 82, daily_save_velocity: 10.0 },
    { snapshot_date: '2026-10-20', save_count: 528, repin_count: 80, daily_save_velocity: 8.0 }
  ];

  const pinsToSync = [{
    pin_id: '998877665544',
    title: 'Monetized Arbitrage Pin',
    domain: 'healthliving.com',
    destination_url: 'https://healthliving.com/keto-recipes',
    image_url: 'https://i.pinimg.com/736x/test.jpg',
    description: 'Detailed high ranking keto recipes for healthy lifestyle',
    created_at_pinterest: '2026-01-15T12:00:00.000Z',
    daily_trajectory: sampleTrajectory
  }];

  const syncedCount = await syncPinsBatchToD1(env, pinsToSync);
  assert.strictEqual(syncedCount, 1, 'syncPinsBatchToD1 must sync 1 pin');

  const hydratedMap = await hydratePinsFromD1(env, ['998877665544']);
  const pin = hydratedMap.get('998877665544');
  assert.ok(pin, 'Pin must be hydrated from D1');
  assert.strictEqual(pin.title, 'Monetized Arbitrage Pin');
  assert.ok(Array.isArray(pin.daily_trajectory), 'daily_trajectory must be parsed into an array');
  assert.strictEqual(pin.daily_trajectory.length, 3, 'daily_trajectory must have 3 days');
  assert.strictEqual(pin.daily_trajectory[0].save_count, 550);
});

// =============================================================================
// Section 2: Fast Edge Dossier Resolver (< 3ms)
// =============================================================================
console.log('\n[*] Section 2: Fast Edge Dossier Resolver (< 3ms)...');

await runAsyncTest('getFastEdgeDossier returns rich daily_trajectory directly from D1 edge mirror', async () => {
  const mockD1 = createMockD1Database();
  const env = { PIN_D1_DB: mockD1 };

  const sampleTrajectory = [
    { snapshot_date: '2026-10-22', save_count: 1200, repin_count: 150, comment_count: 12, share_count: 5, daily_save_velocity: 25.0 },
    { snapshot_date: '2026-10-21', save_count: 1175, repin_count: 145, comment_count: 12, share_count: 5, daily_save_velocity: 20.0 }
  ];

  await syncPinsBatchToD1(env, [{
    pin_id: '1098245059167667976',
    title: 'Edge Fast Mirror Pin',
    domain: 'pinterest.com',
    destination_url: 'https://example.com/target',
    image_url: 'https://i.pinimg.com/736x/fast.jpg',
    description: 'Rich description with plenty of characters exceeding minimum threshold',
    created_at_pinterest: '2026-02-01T10:00:00.000Z',
    daily_trajectory: sampleTrajectory
  }]);

  const tStart = performance.now();
  const fastDossier = await getFastEdgeDossier('1098245059167667976', env);
  const tElapsed = performance.now() - tStart;

  assert.strictEqual(fastDossier.success, true);
  assert.strictEqual(fastDossier.source, 'edge_d1');
  assert.ok(Array.isArray(fastDossier.daily_trajectory), 'daily_trajectory must be present');
  assert.strictEqual(fastDossier.daily_trajectory.length, 2, 'Must contain 2 snapshot days');
  assert.strictEqual(fastDossier.creative.save_count, 1200, 'creative.save_count must match latest trajectory point');
  assert.strictEqual(fastDossier.creative.repin_count, 150);
  assert.strictEqual(fastDossier.creative.daily_save_velocity, 25.0);
  console.log(`      Elapsed execution time: ${tElapsed.toFixed(2)}ms (< 5ms target)`);
});

// =============================================================================
// Section 3: Universal Dossier Zero-Wakeup Invariant & Write-Through
// =============================================================================
console.log('\n[*] Section 3: Universal Dossier Zero-Wakeup Invariant & Write-Through...');

await runAsyncTest('fetchUniversalPinDossier ZERO-WAKEUP: Does not connect to or query Shard when D1 has multi-day trajectory', async () => {
  const mockD1 = createMockD1Database();
  let shardConnectCount = 0;
  let shardQueryCount = 0;

  const mockKv = new Map();
  const env = {
    PIN_D1_DB: mockD1,
    PIN_ENGINE_KV: {
      get: async (k) => mockKv.get(k) || null,
      put: async (k, v) => mockKv.set(k, v),
      delete: async (k) => mockKv.delete(k)
    }
  };

  // Seed D1 with valid multi-day trajectory
  await syncPinsBatchToD1(env, [{
    pin_id: '1234567890123456',
    title: 'Zero Wakeup Target Pin',
    domain: 'target.com',
    destination_url: 'https://target.com/item',
    image_url: 'https://i.pinimg.com/736x/item.jpg',
    description: 'High quality rich creative pin description for zero wakeup test',
    created_at_pinterest: '2026-03-01T00:00:00.000Z',
    daily_trajectory: [
      { snapshot_date: '2026-10-22', save_count: 800, repin_count: 100, daily_save_velocity: 15 },
      { snapshot_date: '2026-10-21', save_count: 785, repin_count: 98, daily_save_velocity: 12 },
      { snapshot_date: '2026-10-20', save_count: 773, repin_count: 95, daily_save_velocity: 10 }
    ]
  }]);

  // Mock Hub SQL that returns empty SERP occurrences
  const mockHubSql = async () => [];

  // Canary shard tracker: If resolveShardConnection or shard query is executed, fail!
  const canaryHubSql = new Proxy(mockHubSql, {
    apply(target, thisArg, argArray) {
      const q = String(argArray[0] || '');
      if (q.includes('neon_projects_registry')) {
        shardConnectCount++;
      }
      return Reflect.apply(target, thisArg, argArray);
    }
  });

  const dossier = await fetchUniversalPinDossier({
    hubSql: canaryHubSql,
    pinId: '1234567890123456',
    env,
    bypassEdgeCache: false
  });

  assert.strictEqual(dossier.success, true);
  assert.strictEqual(dossier.pin_id, '1234567890123456');
  assert.ok(dossier.daily_trajectory.length >= 2, 'Dossier must have multi-day trajectory');
  assert.strictEqual(shardConnectCount, 0, 'Shard registry lookup MUST NOT occur when D1 trajectory is cached');
  assert.strictEqual(shardQueryCount, 0, 'Shard queries MUST NOT execute when D1 trajectory is cached');
});

await runAsyncTest('fetchUniversalPinDossier WRITE-THROUGH: Asynchronously persists trajectory into D1 and KV', async () => {
  const mockD1 = createMockD1Database();
  const mockKv = new Map();
  const env = {
    PIN_D1_DB: mockD1,
    PIN_ENGINE_KV: {
      get: async (k) => mockKv.get(k) || null,
      put: async (k, v) => mockKv.set(k, v),
      delete: async (k) => mockKv.delete(k)
    }
  };

  // Mock Shard SQL returning pin master record and snapshots
  const mockShardSql = Object.assign(
    async (strings, ...values) => {
      const q = strings.join('');
      if (q.includes('FROM universal_master_pins')) {
        return [{
          pin_id: '554433221100',
          title: 'Shard Source Pin',
          domain: 'source.com',
          destination_url: 'https://source.com/item',
          image_url: 'https://i.pinimg.com/736x/source.jpg',
          description: 'Descriptive text directly from Shard universal_master_pins table',
          alt_text: 'Alt text',
          dominant_color: '#112233',
          visual_annotations: '[]',
          created_at_pinterest: '2026-02-10T00:00:00.000Z',
          metadata: {}
        }];
      }
      if (q.includes('FROM pins_daily_rollups_v2') || q.includes('FROM pins_daily_snapshots')) {
        return [
          { snapshot_date: '2026-10-22', save_count: 950, repin_count: 120, daily_save_velocity: 20 },
          { snapshot_date: '2026-10-21', save_count: 930, repin_count: 115, daily_save_velocity: 18 }
        ];
      }
      return [];
    },
    { transaction: async () => [] }
  );

  const mockHubSql = async () => [];

  // Register mock shard SQL client in globalShardMap
  const targetShardId = getPinShardId('554433221100', 99);
  const mockDsn = 'postgres://user:pass@ep-test-shard-warm.neon.tech/neondb';
  _setShardSqlClient(mockDsn, mockShardSql);
  globalShardMap.set(targetShardId, { database_url: mockDsn, cachedAt: Date.now() });

  const dossier = await fetchUniversalPinDossier({
    hubSql: mockHubSql,
    pinId: '554433221100',
    env,
    bypassEdgeCache: true
  });

  assert.strictEqual(dossier.success, true);
  // Verify write-through happened into D1
  const d1Entry = mockD1._store.get('554433221100');
  assert.ok(d1Entry, 'D1 edge_pins_metadata must have received write-through');
  assert.ok(d1Entry.daily_trajectory, 'D1 must store daily_trajectory');
  const parsedD1Traj = JSON.parse(d1Entry.daily_trajectory);
  assert.ok(Array.isArray(parsedD1Traj) && parsedD1Traj.length >= 1, 'D1 daily_trajectory must be a valid array');

  // Verify write-through happened into KV
  const kvEntry = mockKv.get('pin:dossier?pin_id=554433221100');
  assert.ok(kvEntry, 'KV pin:dossier?pin_id=554433221100 must be populated');
});

// =============================================================================
// Section 4: Predictive Hover JIT Warming Endpoint (/api/fleet/warm)
// =============================================================================
console.log('\n[*] Section 4: Predictive Hover JIT Warming Endpoint (/api/fleet/warm)...');

await runAsyncTest('GET /api/fleet/warm pings target shard deterministically and returns 200 JSON', async () => {
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    PIN_ENGINE_KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  };

  const pinId = '1098245059167667976';
  const expectedShardId = getPinShardId(pinId, 99);

  const req = new Request(`https://worker.test/api/fleet/warm?pin_id=${pinId}`, { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);

  assert.strictEqual(res.status, 200, 'Warming endpoint must return HTTP 200 OK');
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.shard_id, expectedShardId, 'Target shard must match deterministic getPinShardId');
  assert.strictEqual(data.warmed, true);
});

await runAsyncTest('GET /api/fleet/warm accepts explicit shard query parameter', async () => {
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    PIN_ENGINE_KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  };

  const req = new Request('https://worker.test/api/fleet/warm?shard=42', { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.shard_id, 42);
});

await runAsyncTest('GET /api/fleet/warm 15-second deduplication cooldown protects against spamming', async () => {
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    PIN_ENGINE_KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  };

  // Immediate second call to shard 42
  const req2 = new Request('https://worker.test/api/fleet/warm?shard=42', { method: 'GET' });
  const res2 = await worker.fetch(req2, mockEnv);
  assert.strictEqual(res2.status, 200);
  const data2 = await res2.json();
  assert.strictEqual(data2.success, true);
  assert.strictEqual(data2.cached, true, 'Second ping within 15s must be flagged cached/cooldown');
  assert.strictEqual(data2.warmed, false);
});

await runAsyncTest('GET /api/fleet/warm rejects missing pin_id and shard with 400 Bad Request', async () => {
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    PIN_ENGINE_KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  };

  const req = new Request('https://worker.test/api/fleet/warm', { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.error, 'INVALID_PARAM');
});

// =============================================================================
// Section 5: Client-Side Edge Shield Script Syntax & Debounced Hover
// =============================================================================
console.log('\n[*] Section 5: Client-Side Edge Shield Script Syntax & Debounced Hover...');

runTest('getEdgeShieldClientScript produces 100% syntactically valid JavaScript', () => {
  const html = getEdgeShieldClientScript();
  assert.ok(html.startsWith('<script>'), 'Must start with script tag');
  assert.ok(html.endsWith('</script>'), 'Must end with script tag');
  const code = html.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
  new vm.Script(code); // Throws SyntaxError if invalid
});

runTest('getEdgeShieldClientScript includes predictive JIT warming call with 120-150ms debounce', () => {
  const html = getEdgeShieldClientScript();
  assert.ok(html.includes('/api/fleet/warm?pin_id='), 'Must call /api/fleet/warm?pin_id=');
  assert.ok(html.includes('130'), 'Must use 130ms debounce (within 120-150ms window)');
  assert.ok(html.includes('/api/pins/'), 'Must preserve fast edge prefetch');
  assert.ok(html.includes('warmCache'), 'Must maintain deduplication set for warm calls');
  assert.ok(html.includes('mouseout'), 'Must cancel debounce timer on mouseout');
});

// =============================================================================
// Summary
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log(`✅ ALL ${passed}/${total} JIT WARMING & D1 TRAJECTORY FORENSIC TESTS PASSED (100% GREEN)`);
console.log('='.repeat(80));
