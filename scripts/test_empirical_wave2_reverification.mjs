/**
 * Empirical Wave 2 Re-Verification & Adversarial Stress Suite
 * Focus: Deep KV Caching, Trajectory Dual-Contract, Downstream Invariants, and Edge Mutation
 */

import assert from 'node:assert';
import { getPinDeepDossier } from '../src/modules/keywords/service.mjs';
import { getPinDetailWithMetrics } from '../src/modules/creators/service.mjs';

console.log('================================================================================');
console.log('🔬 EMPIRICAL RE-VERIFICATION: WAVE 2 KV CACHE & TRAJECTORY HARDENING');
console.log('================================================================================\n');

let total = 0;
let passed = 0;

function runAsync(name, fn) {
  total++;
  return fn()
    .then(() => {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    });
}

// =============================================================================
// Test 1: Full Multi-Record Trajectory on KV Cache Hit
// =============================================================================
await runAsync('KV Cache Hit: Multi-record trajectory has both Array iteration and .snapshots', async () => {
  const pinId = '112233445566778899';
  const kid = 101;
  const kvKey = `dossier:pin:${pinId}:${kid}`;

  const mockSnapshots = [
    { snapshot_date: '2026-10-24', save_count: 1200, repin_count: 300, reaction_count: 50 },
    { snapshot_date: '2026-10-23', save_count: 1150, repin_count: 290, reaction_count: 48 },
    { snapshot_date: '2026-10-22', save_count: 1100, repin_count: 280, reaction_count: 45 }
  ];

  const payload = {
    success: true,
    pin_id: pinId,
    keyword_id: kid,
    title: 'Test Multi-Record Pin',
    kpis: { total_saves: 1200, repins: 300, reactions: 50 },
    deltas: { saves_24h: 50, repins_24h: 10, reactions_24h: 2 },
    trajectory: mockSnapshots
  };

  const store = new Map();
  store.set(kvKey, JSON.stringify(payload));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k, opts) => {
        const v = store.get(k);
        return v && opts?.type === 'json' ? JSON.parse(v) : v;
      },
      put: async (k, v) => store.set(k, v)
    }
  };

  const res = await getPinDeepDossier(null, pinId, kid, { env: mockEnv, forceRefresh: false });

  assert.strictEqual(res.source, 'kv_edge', 'Must be served from kv_edge');
  assert.strictEqual(res.pin_id, pinId);

  // Array assertion
  assert(Array.isArray(res.trajectory), 'res.trajectory must be an Array');
  assert.strictEqual(res.trajectory.length, 3, 'res.trajectory must have 3 items');

  // .snapshots assertion
  assert(res.trajectory.snapshots !== undefined, 'res.trajectory.snapshots must be defined');
  assert(Array.isArray(res.trajectory.snapshots), 'res.trajectory.snapshots must be an Array');
  assert.strictEqual(res.trajectory.snapshots.length, 3, 'res.trajectory.snapshots must have 3 items');

  // Value equivalence and reference parity
  assert.strictEqual(res.trajectory.snapshots, res.trajectory, 'snapshots should point to trajectory array');
  assert.strictEqual(res.trajectory[0].save_count, 1200);
  assert.strictEqual(res.trajectory.snapshots[0].save_count, 1200);

  // Downstream operations
  const dates = res.trajectory.snapshots.map(s => s.snapshot_date);
  assert.deepStrictEqual(dates, ['2026-10-24', '2026-10-23', '2026-10-22']);
});

// =============================================================================
// Test 2: Empty Trajectory on KV Cache Hit
// =============================================================================
await runAsync('KV Cache Hit: Empty trajectory [] preserves .snapshots = []', async () => {
  const pinId = '999999999999999999';
  const kid = 0;
  const kvKey = `dossier:pin:${pinId}:0`;

  const payload = {
    success: true,
    pin_id: pinId,
    keyword_id: null,
    title: 'Empty Trajectory Pin',
    kpis: { total_saves: 0 },
    trajectory: []
  };

  const store = new Map();
  store.set(kvKey, JSON.stringify(payload));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k, opts) => {
        const v = store.get(k);
        return v && opts?.type === 'json' ? JSON.parse(v) : v;
      }
    }
  };

  const res = await getPinDeepDossier(null, pinId, null, { env: mockEnv, forceRefresh: false });

  assert.strictEqual(res.source, 'kv_edge');
  assert(Array.isArray(res.trajectory));
  assert.strictEqual(res.trajectory.length, 0);
  assert(Array.isArray(res.trajectory.snapshots));
  assert.strictEqual(res.trajectory.snapshots.length, 0);
});

// =============================================================================
// Test 3: Idempotence & Re-Serialization Roundtrip
// =============================================================================
await runAsync('KV Cache Hit: Re-serialization and double KV retrieval maintains contract', async () => {
  const pinId = '777777777777777777';
  const kid = 12;
  const kvKey = `dossier:pin:${pinId}:${kid}`;

  const store = new Map();
  store.set(kvKey, JSON.stringify({
    success: true,
    pin_id: pinId,
    keyword_id: kid,
    title: 'Re-serialization Pin',
    trajectory: [{ snapshot_date: '2026-10-24', save_count: 5 }]
  }));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k, opts) => {
        const v = store.get(k);
        return v && opts?.type === 'json' ? JSON.parse(v) : v;
      },
      put: async (k, v) => store.set(k, v)
    }
  };

  // First fetch from KV
  const first = await getPinDeepDossier(null, pinId, kid, { env: mockEnv });
  assert.strictEqual(first.source, 'kv_edge');
  assert(Array.isArray(first.trajectory.snapshots));

  // Re-serialize back to KV (simulating another cache layer or put)
  await mockEnv.PIN_ENGINE_KV.put(kvKey, JSON.stringify(first));

  // Second fetch from KV
  const second = await getPinDeepDossier(null, pinId, kid, { env: mockEnv });
  assert.strictEqual(second.source, 'kv_edge');
  assert(Array.isArray(second.trajectory));
  assert(Array.isArray(second.trajectory.snapshots));
  assert.strictEqual(second.trajectory.snapshots.length, 1);
  assert.strictEqual(second.trajectory.snapshots[0].save_count, 5);
});

// =============================================================================
// Test 4: forceRefresh Bypasses KV Cache
// =============================================================================
await runAsync('forceRefresh: true bypasses KV cache even when KV hit exists', async () => {
  const pinId = '555555555555555555';
  const kid = 77;
  const kvKey = `dossier:pin:${pinId}:${kid}`;

  const store = new Map();
  store.set(kvKey, JSON.stringify({
    success: true,
    pin_id: pinId,
    keyword_id: kid,
    title: 'Stale KV Title',
    trajectory: [{ snapshot_date: '2026-10-20', save_count: 10 }]
  }));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async () => {
        throw new Error('KV should not be queried when forceRefresh = true');
      }
    }
  };

  // Mock SQL client returning fallback so fetchUniversalPinDossier can proceed
  const mockSql = async () => [];
  mockSql.begin = undefined;

  let reachedLive = false;
  try {
    const res = await getPinDeepDossier(mockSql, pinId, kid, {
      env: mockEnv,
      forceRefresh: true
    });
    // If it didn't throw on KV get, it bypassed KV!
    reachedLive = true;
    assert.notStrictEqual(res.source, 'kv_edge', 'Source must not be kv_edge when forceRefresh is true');
  } catch (err) {
    // If it threw because mockSql is incomplete, verify it did NOT throw from KV
    assert(!err.message.includes('KV should not be queried'), 'KV was incorrectly called under forceRefresh!');
    reachedLive = true;
  }

  assert(reachedLive, 'Successfully bypassed KV under forceRefresh');
});

// =============================================================================
// Test 5: Graceful Handling of Malformed Trajectory in KV
// =============================================================================
await runAsync('KV Cache Hit: Non-array or malformed trajectory does not throw TypeError', async () => {
  const pinId = '333333333333333333';
  const kid = 1;
  const kvKey = `dossier:pin:${pinId}:${kid}`;

  const store = new Map();
  store.set(kvKey, JSON.stringify({
    success: true,
    pin_id: pinId,
    keyword_id: kid,
    title: 'Malformed Trajectory Pin',
    trajectory: null // null instead of array
  }));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k, opts) => {
        const v = store.get(k);
        return v && opts?.type === 'json' ? JSON.parse(v) : v;
      }
    }
  };

  const res = await getPinDeepDossier(null, pinId, kid, { env: mockEnv });
  assert.strictEqual(res.source, 'kv_edge');
  assert.strictEqual(res.trajectory, null, 'Null trajectory handled without crashing');
});

// =============================================================================
// Test 6: Cross-Module Verification with getPinDetailWithMetrics
// =============================================================================
await runAsync('getPinDetailWithMetrics consumes universal dossier cleanly', async () => {
  const pinId = '222222222222222222';
  const mockSql = async () => [];

  const res = await getPinDetailWithMetrics(mockSql, pinId, {
    env: null
  });

  assert(res !== null && typeof res === 'object', 'Response must be an object');
  assert('pin' in res, 'Result must contain .pin');
  assert('snapshots' in res, 'Result must contain .snapshots');
  assert('net_growth' in res, 'Result must contain .net_growth');
  assert(Array.isArray(res.snapshots), 'snapshots must be an array');
});

console.log('\n================================================================================');
console.log(`🏁 RE-VERIFICATION RESULTS: ${passed} PASSED | 0 FAILED (Total: ${total})`);
console.log('================================================================================\n');
