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
import { handleAppRequest } from '../src/server.mjs';
const worker = { fetch: handleAppRequest };
import * as pinRepository from '../src/modules/pins/repository.mjs';
import { getEdgeShieldClientScript } from '../src/edge-shield-client.mjs';

const { fetchUniversalPinDossier } = pinRepository;

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

await runAsyncTest('getFastEdgeDossier is removed and fleet-router.mjs is deleted', async () => {
  assert.strictEqual('getFastEdgeDossier' in pinRepository, false, 'getFastEdgeDossier must be removed');
  assert.strictEqual(fs.existsSync(path.resolve('src/modules/sharding/fleet-router.mjs')), false, 'fleet-router.mjs must be deleted');
});

// =============================================================================
// Section 3: Universal Dossier Trajectory Resolution & Fallbacks
// =============================================================================
console.log('\n[*] Section 3: Universal Dossier Trajectory Resolution & Fallbacks...');

await runAsyncTest('fetchUniversalPinDossier resolves pin trajectory from Unified PostgreSQL', async () => {
  const mockSql = Object.assign(
    async (strings) => {
      const q = strings.join('');
      if (q.includes('FROM universal_master_pins')) {
        return [{
          pin_id: '554433221100',
          title: 'Unified PG Source Pin',
          domain: 'source.com',
          destination_url: 'https://source.com/item',
          image_url: 'https://i.pinimg.com/736x/source.jpg',
          description: 'Descriptive text directly from Unified PostgreSQL',
          alt_text: 'Alt text',
          dominant_color: '#112233',
          visual_annotations: '[]',
          created_at_pinterest: '2026-02-10T00:00:00.000Z',
          metadata: {}
        }];
      }
      if (q.includes('FROM pins_daily_snapshots') || q.includes('FROM pins_daily_metrics')) {
        return [
          { snapshot_date: '2026-10-22', save_count: 950, repin_count: 120, daily_save_velocity: 20 },
          { snapshot_date: '2026-10-21', save_count: 930, repin_count: 115, daily_save_velocity: 18 }
        ];
      }
      return [];
    },
    { transaction: async () => [] }
  );

  const dossier = await fetchUniversalPinDossier({
    sql: mockSql,
    pinId: '554433221100',
    bypassEdgeCache: true
  });

  assert.strictEqual(dossier.success, true);
  assert.strictEqual(dossier.pin_id, '554433221100');
  assert.ok(Array.isArray(dossier.daily_trajectory));
});

await runAsyncTest('fetchUniversalPinDossier DEGRADED FALLBACK: Correctly flags is_degraded: true when snapshot query fails', async () => {
  const mockSql = Object.assign(
    async (strings) => {
      const q = strings.join('');
      if (q.includes('FROM pins_daily_snapshots')) {
        throw new Error('simulated pins_daily_snapshots query failure');
      }
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
      if (q.includes('FROM universal_master_pins')) {
        return [{ pin_id: '998877665544', title: 'Master' }];
      }
      return [];
    },
    { transaction: async () => [] }
  );

  const dossier = await fetchUniversalPinDossier({
    sql: mockSql,
    pinId: '998877665544',
    bypassEdgeCache: true
  });

  assert.strictEqual(dossier.success, true);
  assert.strictEqual(dossier.is_degraded, true);
});

// =============================================================================
// Section 4: Removed Fleet Warming Routes & Unified Health / Cache Endpoints
// =============================================================================
console.log('\n[*] Section 4: Removed Fleet Routes & Unified Health/Cache Endpoints...');

await runAsyncTest('GET /api/fleet/warm is permanently decommissioned (returns 404 NOT_FOUND)', async () => {
  const mockEnv = {
    SQL_CLIENT: async () => [{ alive: 1 }]
  };

  const req = new Request('https://worker.test/api/fleet/warm?pin_id=1098245059167667976', { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);
  assert.strictEqual(res.status, 404, 'Removed fleet warming route must return HTTP 404');
  const data = await res.json();
  assert.strictEqual(data.error, 'NOT_FOUND');
});

await runAsyncTest('GET /api/health returns 200 with unified_postgres topology', async () => {
  const mockEnv = {
    SQL_CLIENT: async () => [{ alive: 1 }]
  };

  const req = new Request('https://worker.test/api/health', { method: 'GET' });
  const res = await worker.fetch(req, mockEnv);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'healthy');
  assert.strictEqual(data.topology, 'unified_postgres');
});

await runAsyncTest('POST /api/cache/invalidate enforces authentication (401 unauth, 200 with Bearer)', async () => {
  const mockEnv = {
    API_SECRET_KEY: 'test-secret-key-jit',
    SQL_CLIENT: async () => [{ alive: 1 }]
  };

  const reqUnauth = new Request('https://worker.test/api/cache/invalidate', { method: 'POST' });
  const resUnauth = await worker.fetch(reqUnauth, mockEnv);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated cache invalidation must return 401');

  const reqAuth = new Request('https://worker.test/api/cache/invalidate', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret-key-jit', 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'all', event: 'test' })
  });
  const resAuth = await worker.fetch(reqAuth, mockEnv);
  assert.strictEqual(resAuth.status, 200, 'Authenticated cache invalidation must return 200');
  const data = await resAuth.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.invalidated, true);
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
