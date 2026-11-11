#!/usr/bin/env node

/**
 * Runtime & Infrastructure Architect Verification Suite for PAE v6.0 Rebuild
 * Validates:
 * 1. src/server.mjs:
 *    - Import from src/db/client.mjs
 *    - Non-blocking res.end() via serverBackgroundTaskQueue (p-limit(4))
 *    - Declarative routes: GET /api/health & POST /api/internal/ingest
 * 2. workers/wake-shield/src/index.mjs:
 *    - Decoupled API (15000ms) vs browser navigation (3500ms) timeouts
 *    - Health probe /api/health check prior to 503 waking splash
 * 3. .github/workflows/ci.yml:
 *    - InstaBox VPS auto-deploy targeting /data/app on m_agq2t32m5xv5joj67rqoze5h4u
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import serverModule, {
  serverBackgroundTaskQueue,
  declarativeRoutes,
  createRequestListener
} from '../src/server.mjs';
import wakeShieldModule from '../workers/wake-shield/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================================');
console.log('🧪 RUNTIME & INFRASTRUCTURE ARCHITECT VERIFICATION SUITE');
console.log('================================================================================\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  console.log('[AXIS 1] Static Code & Import Parity in src/server.mjs');
  const serverCode = fs.readFileSync(path.join(rootDir, 'src/server.mjs'), 'utf8');
  test('Imports createSqlClient & getSqlClient from ./db/client.mjs', () => {
    assert(serverCode.includes("from './db/client.mjs'"), 'Must import from ./db/client.mjs');
    assert(!serverCode.includes("from './modules/sharding/fleet-router.mjs'"), 'Must NOT import SQL client from fleet-router');
  });

  test('Exports serverBackgroundTaskQueue with concurrency 4', () => {
    assert(serverBackgroundTaskQueue, 'serverBackgroundTaskQueue must exist');
    assert.strictEqual(serverBackgroundTaskQueue.concurrency, 4, 'Concurrency must be 4');
  });

  test('server.mjs does NOT await Promise.allSettled(bgPromises) before res.end()', () => {
    assert(!serverCode.includes('await Promise.allSettled(bgPromises)'), 'Must NOT block res.end on bgPromises');
  });

  console.log('\n[AXIS 2] Declarative Route Registry & Ingestion in src/server.mjs');
  test('GET /api/health declarative route is registered', () => {
    const healthRoute = declarativeRoutes.find(r => r.method === 'GET' && r.path === '/api/health');
    assert(healthRoute, 'GET /api/health must be registered');
  });

  test('POST /api/internal/ingest declarative route is registered', () => {
    const ingestRoute = declarativeRoutes.find(r => r.method === 'POST' && r.path === '/api/internal/ingest');
    assert(ingestRoute, 'POST /api/internal/ingest must be registered');
  });

  await asyncTest('GET /api/health returns 200 JSON with queue telemetry', async () => {
    const healthRoute = declarativeRoutes.find(r => r.method === 'GET' && r.path === '/api/health');
    const res = await healthRoute.handler({
      env: { DATABASE_TOPOLOGY: 'unified_postgres' }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.server, 'node_native_pae_server');
    assert(data.background_queue, 'Queue telemetry must be present');
    assert.strictEqual(typeof data.background_queue.pending, 'number');
  });

  await asyncTest('POST /api/internal/ingest rejects unauthorized requests without key', async () => {
    const ingestRoute = declarativeRoutes.find(r => r.method === 'POST' && r.path === '/api/internal/ingest');
    const webReq = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pins: [{ pin_id: '123' }] })
    });
    const res = await ingestRoute.handler({
      env: { API_SECRET_KEY: 'secret123', NODE_ENV: 'production' },
      webRequest: webReq
    });
    assert.strictEqual(res.status, 401);
  });

  await asyncTest('POST /api/internal/ingest accepts authorized requests and enqueues tasks', async () => {
    const ingestRoute = declarativeRoutes.find(r => r.method === 'POST' && r.path === '/api/internal/ingest');
    const testPins = [{ pin_id: '123456789012345678' }];
    const webReq = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret'
      },
      body: JSON.stringify({ pins: testPins })
    });
    const res = await ingestRoute.handler({
      env: { API_SECRET_KEY: 'test-secret', NODE_ENV: 'production' },
      webRequest: webReq
    });
    assert.strictEqual(res.status, 202);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.queued, true);
    assert.strictEqual(data.received, 1);
  });

  console.log('\n[AXIS 3] Non-Blocking Background Queue Execution (p-limit(4))');
  await asyncTest('serverBackgroundTaskQueue processes async tasks concurrently with ceiling 4', async () => {
    let activePeak = 0;
    let currentActive = 0;
    const taskCount = 8;
    const promises = [];

    for (let i = 0; i < taskCount; i++) {
      promises.push(serverBackgroundTaskQueue.add(async () => {
        currentActive++;
        activePeak = Math.max(activePeak, currentActive);
        await new Promise(r => setTimeout(r, 20));
        currentActive--;
      }));
    }

    await Promise.all(promises);
    assert(activePeak <= 4, `Peak active tasks must be <= 4 (observed: ${activePeak})`);
  });

  console.log('\n[AXIS 4] workers/wake-shield/src/index.mjs Decoupling & Health Probe');
  const shieldCode = fs.readFileSync(path.join(rootDir, 'workers/wake-shield/src/index.mjs'), 'utf8');

  test('Decouples API timeout (15000ms) from browser navigation timeout (3500ms)', () => {
    assert(shieldCode.includes('timeoutMs = (isBrowserNavigation || isHealthProbe) ? 3500 : 15000'), 'Must decouple timeouts');
  });

  test('Probes /api/health before returning 503 waking splash', () => {
    assert(shieldCode.includes("const healthUrl = new URL('/api/health', url.origin);"), 'Must probe /api/health');
    assert(shieldCode.includes('if (vpsAwake) {'), 'Must check if vps is awake');
  });

  console.log('\n[AXIS 5] CI/CD Workflow Auto-Deploy to InstaBox VPS (/data/app)');
  const ciCode = fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');

  test('ci.yml contains auto-deploy step targeting /data/app', () => {
    assert(ciCode.includes('/data/app'), 'Must target /data/app');
  });

  test('ci.yml targets InstaBox machine m_agq2t32m5xv5joj67rqoze5h4u via Exec API', () => {
    assert(ciCode.includes('m_agq2t32m5xv5joj67rqoze5h4u'), 'Must target correct machine ID');
    assert(ciCode.includes('api.instabox.sh/v1/machines/${IB_MACHINE_ID}/exec'), 'Must use InstaBox Exec API');
  });

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passed}/${total} RUNTIME ARCHITECT VERIFICATION CHECKS PASSED (100% GREEN)`);
  console.log('================================================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL TEST FAILURE]', err);
  process.exit(1);
});
