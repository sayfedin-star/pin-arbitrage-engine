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
import {
  createFastifyApp,
  serverBackgroundTaskQueue
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

  console.log('\n[AXIS 2] Native Fastify Route Registry & Ingestion in src/server.mjs');
  const appUnauth = createFastifyApp({ API_SECRET_KEY: 'secret123', NODE_ENV: 'production', DATABASE_TOPOLOGY: 'unified_postgres' });
  const appAuth = createFastifyApp({ API_SECRET_KEY: 'test-secret', NODE_ENV: 'production', DATABASE_TOPOLOGY: 'unified_postgres' });

  test('GET /api/health Fastify route is registered', () => {
    assert(appAuth.hasRoute({ method: 'GET', url: '/api/health' }), 'GET /api/health must be registered');
  });

  test('POST /api/internal/ingest Fastify route is registered', () => {
    assert(appAuth.hasRoute({ method: 'POST', url: '/api/internal/ingest' }), 'POST /api/internal/ingest must be registered');
  });

  await asyncTest('GET /api/health returns 200 JSON with queue telemetry', async () => {
    const res = await appAuth.inject({ method: 'GET', url: '/api/health' });
    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.server, 'node_native_pae_server');
    assert(data.background_queue, 'Queue telemetry must be present');
    assert.strictEqual(typeof data.background_queue.pending, 'number');
  });

  await asyncTest('POST /api/internal/ingest rejects unauthorized requests without key', async () => {
    const res = await appUnauth.inject({
      method: 'POST',
      url: '/api/internal/ingest',
      headers: { 'content-type': 'application/json' },
      payload: { pins: [{ pin_id: '123' }] }
    });
    assert.strictEqual(res.statusCode, 401);
  });

  await asyncTest('POST /api/internal/ingest accepts authorized requests and enqueues tasks', async () => {
    const res = await appAuth.inject({
      method: 'POST',
      url: '/api/internal/ingest',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-secret'
      },
      payload: { pins: [{ pin_id: '123456789012345678' }] }
    });
    assert.strictEqual(res.statusCode, 202);
    const data = res.json();
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

  console.log('\n[AXIS 5] CI/CD Workflow Auto-Deploy & 3-Layer Wakeup to InstaBox VPS (/data/app)');
  const ciCode = fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');

  test('ci.yml contains auto-deploy step targeting /data/app', () => {
    assert(ciCode.includes('/data/app'), 'Must target /data/app');
  });

  test('ci.yml targets InstaBox machine m_agq2t32m5xv5joj67rqoze5h4u via Exec API and Operation Long-Polling', () => {
    assert(ciCode.includes('m_agq2t32m5xv5joj67rqoze5h4u'), 'Must target correct machine ID');
    assert(ciCode.includes('api.instabox.sh/v1/machines/${IB_MACHINE_ID}/exec'), 'Must use InstaBox Exec API');
    assert(ciCode.includes('api.instabox.sh/v1/operations/${OP_ID}?wait=25s'), 'Must long-poll InstaBox Operation endpoint');
    assert(ciCode.includes('instabox-boot-sync.sh --install-hook'), 'Must install Layer 2 boot-sync hook');
    assert(ciCode.includes('/api/internal/self-update'), 'Must include Layer 3 self-update webhook fallback');
    assert(!/\\"cmd\\"\s*:\s*\[|'cmd':\s*\[|"cmd"\s*:\s*\[/.test(ciCode), 'InstaBox /exec cmd MUST be a string (use argv for array)');
    assert(ciCode.includes('cwd: "/data/app"') && ciCode.includes('timeoutSeconds: 300'), 'Must pass valid cwd and timeoutSeconds to ExecRequest');
  });

  test('scripts/instabox-boot-sync.sh exists and POST /api/internal/self-update route is registered', () => {
    assert(fs.existsSync(path.join(rootDir, 'scripts/instabox-boot-sync.sh')), 'instabox-boot-sync.sh must exist');
    assert(appAuth.hasRoute({ method: 'POST', url: '/api/internal/self-update' }), 'POST /api/internal/self-update must be registered');
  });

  await appUnauth.close();
  await appAuth.close();

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passed}/${total} RUNTIME ARCHITECT VERIFICATION CHECKS PASSED (100% GREEN)`);
  console.log('================================================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL TEST FAILURE]', err);
  process.exit(1);
});
