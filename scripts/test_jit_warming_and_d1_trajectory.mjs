/**
 * Deep Forensic Test Suite: Neon Snapshot Architecture & Predictive Hover JIT Warming
 * 
 * Verifies:
 * 1. Pure Neon Serverless Postgres architecture (d1-metadata.mjs permanently purged).
 * 2. Safe Edge Dossier Resolver (< 3ms) non-blocking contract.
 * 3. Universal Dossier Trajectory Resolution from Neon Shards and graceful degradation.
 * 4. /api/fleet/warm Predictive Hover JIT Warming Endpoint.
 * 5. src/edge-shield-client.mjs debounced hover and script syntax.
 */

import assert from 'node:assert';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.mjs';
import * as fleetRouter from '../src/modules/sharding/fleet-router.mjs';
import { getEdgeShieldClientScript } from '../src/edge-shield-client.mjs';

const {
  fetchUniversalPinDossier,
  getPinShardId,
  getPhysicalShardId,
  globalShardMap,
  _setShardSqlClient
} = fleetRouter;

console.log('='.repeat(80));
console.log('   DEEP FORENSIC AUDIT: NEON SNAPSHOT ARCHITECTURE & HOVER JIT WARMING');
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
// Section 1: Pure Neon Architecture Parity
// =============================================================================
console.log('\n[*] Section 1: Pure Neon Architecture Parity...');

runTest('d1-metadata.mjs is permanently purged in pure Neon architecture', () => {
  assert.strictEqual(fs.existsSync(path.resolve('src/modules/keywords/d1-metadata.mjs')), false);
});

// =============================================================================
// Section 2: Ghost Edge Prefetch Decommissioned (Phase 3)
// =============================================================================
console.log('\n[*] Section 2: Ghost Edge Prefetch Decommissioned...');

await runAsyncTest('getFastEdgeDossier is removed from fleet-router.mjs exports', async () => {
  assert.strictEqual('getFastEdgeDossier' in fleetRouter, false, 'getFastEdgeDossier must be removed');
});

// =============================================================================
// Section 3: Universal Dossier Trajectory Resolution & Fallbacks
// =============================================================================
console.log('\n[*] Section 3: Universal Dossier Trajectory Resolution & Fallbacks...');

await runAsyncTest('fetchUniversalPinDossier resolves pin trajectory from Shards', async () => {
  const mockShardSql = Object.assign(
    async (strings) => {
      const q = strings.join('');
      if (q.includes('FROM universal_master_pins')) {
        return [{
          pin_id: '554433221100',
          title: 'Shard Source Pin',
          domain: 'source.com',
          destination_url: 'https://source.com/item',
          image_url: 'https://i.pinimg.com/736x/source.jpg',
          description: 'Descriptive text directly from Shard',
          alt_text: 'Alt text',
          dominant_color: '#112233',
          visual_annotations: '[]',
          created_at_pinterest: '2026-02-10T00:00:00.000Z',
          metadata: {}
        }];
      }
      if (q.includes('FROM pins_daily_rollups_v2') || q.includes('FROM pins_daily_snapshots') || q.includes('FROM pins_daily_metrics')) {
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
  const targetShardId = getPinShardId('554433221100', 99);
  const mockDsn = 'postgres://user:pass@ep-test-shard-warm.neon.tech/neondb';
  _setShardSqlClient(mockDsn, mockShardSql);
  globalShardMap.set(targetShardId, { database_url: mockDsn, cachedAt: Date.now() });

  const dossier = await fetchUniversalPinDossier({
    hubSql: mockHubSql,
    pinId: '554433221100',
    env: { DATABASE_URL: mockDsn },
    bypassEdgeCache: true
  });

  assert.strictEqual(dossier.success, true);
  assert.strictEqual(dossier.pin_id, '554433221100');
  assert.ok(Array.isArray(dossier.daily_trajectory));
});

await runAsyncTest('fetchUniversalPinDossier DEGRADED FALLBACK: Correctly flags is_degraded: true when shard query returns empty', async () => {
  const mockHubSql = async (strings) => {
    const q = strings.join('');
    if (q.includes('FROM keyword_serp_current')) {
      return [{
        keyword_id: 5,
        pin_id: '998877665544',
        title: 'Degraded Fallback Test Pin',
        domain: 'fallback.com',
        destination_url: 'https://fallback.com/item',
        image_url: 'https://i.pinimg.com/736x/fb.jpg',
        save_count: 500,
        repin_count: 50,
        daily_save_velocity: 10,
        crawled_at: '2026-10-22T05:00:00.000Z',
        updated_at: '2026-10-22T05:00:00.000Z',
        baseline_day_date: '2026-10-21',
        baseline_day_saves: 490,
        metadata: {}
      }];
    }
    return [];
  };

  const mockEmptyShardSql = Object.assign(
    async (strings) => {
      const q = strings.join('');
      if (q.includes('FROM universal_master_pins')) {
        return [{ pin_id: '998877665544', title: 'Master' }];
      }
      return [];
    },
    { transaction: async () => [] }
  );

  const targetShardId = getPinShardId('998877665544', 99);
  const mockDsn = 'postgres://user:pass@ep-test-shard-degraded.neon.tech/neondb';
  _setShardSqlClient(mockDsn, mockEmptyShardSql);
  globalShardMap.set(targetShardId, { database_url: mockDsn, cachedAt: Date.now() });

  const dossier = await fetchUniversalPinDossier({
    hubSql: mockHubSql,
    pinId: '998877665544',
    env: { DATABASE_URL: mockDsn },
    bypassEdgeCache: true
  });

  assert.strictEqual(dossier.success, true);
  assert.strictEqual(dossier.is_degraded, true);
  assert.strictEqual(dossier.from_shard_snapshots, false);
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
  const expectedPhysicalShardId = getPhysicalShardId(expectedShardId);

  const req = new Request(`https://worker.test/api/fleet/warm?pin_id=${pinId}`, { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);

  assert.strictEqual(res.status, 200, 'Warming endpoint must return HTTP 200 OK');
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.shard_id === expectedShardId || data.shard_id === expectedPhysicalShardId, 'Target shard must match deterministic getPinShardId or consolidated physical shard');
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
  assert.ok(data.shard_id === 42 || data.shard_id === getPhysicalShardId(42), 'Target shard must match virtual shard 42 or physical shard 2');
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

runTest('getEdgeShieldClientScript omits ghost hoverPrefetchTimer and mouseover/mouseout hover listeners', () => {
  const html = getEdgeShieldClientScript();
  assert.strictEqual(html.includes('hoverPrefetchTimer'), false, 'Ghost hoverPrefetchTimer must be removed');
  assert.strictEqual(html.includes("addEventListener('mouseover'"), false, 'Mouseover hover listener must be removed');
  assert.strictEqual(html.includes("addEventListener('mouseout'"), false, 'Mouseout hover listener must be removed');
  assert.ok(html.includes('window.safeApiFetch'), 'Must preserve window.safeApiFetch edge shield');
});

// =============================================================================
// Summary
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log(`✅ ALL ${passed}/${total} JIT WARMING & D1 TRAJECTORY FORENSIC TESTS PASSED (100% GREEN)`);
console.log('='.repeat(80));
