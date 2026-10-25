#!/usr/bin/env node
/**
 * scripts/test_domain_dossier_benchmark.mjs
 * Benchmark and verification for domain dossier cold-start optimization & bounded shard hydration.
 */

import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import { neon } from '@neondatabase/serverless';
import worker from '../src/worker.mjs';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';
import { getDomainDeepDossier, fetchAndCacheDomainAge } from '../src/modules/domains/service.mjs';
import { fetchAndCacheDomainAdNetwork } from '../src/modules/domains/ad-network-service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] DATABASE_URL is required to run domain dossier benchmark.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));
const mockKv = new Map();
const mockKvOpts = new Map();
const mockKvStore = {
  get: async (key, opts) => {
    const val = mockKv.get(key);
    if (!val) return null;
    return opts?.type === 'json' ? JSON.parse(val) : val;
  },
  put: async (key, value, opts) => {
    mockKv.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    if (opts) mockKvOpts.set(key, opts);
  },
  delete: async (key) => {
    mockKv.delete(key);
    mockKvOpts.delete(key);
  }
};

const mockEnv = {
  DATABASE_URL,
  SQL_CLIENT: sql,
  PIN_ENGINE_KV: mockKvStore
};

async function runBenchmark() {
  console.log('================================================================================');
  console.log('⚡ DOMAIN DOSSIER PERFORMANCE & BOUNDED SHARD HYDRATION BENCHMARK');
  console.log('================================================================================\n');

  const testDomain = 'payhip.com';

  // 1. Benchmark direct getDomainDeepDossier with fastPath (Cold run)
  console.log(`[*] Benchmarking getDomainDeepDossier('${testDomain}', { fastPath: true }) [Cold DB]...`);
  const t0 = performance.now();
  const dossier = await getDomainDeepDossier(sql, testDomain, { env: mockEnv, fastPath: true });
  const coldLatencyMs = Math.round(performance.now() - t0);
  console.log(`[+] Dossier loaded in ${coldLatencyMs}ms (ceiling: 18000ms, previously failed at 24180ms)`);

  assert.ok(dossier, 'Dossier must not be null');
  assert.strictEqual(dossier.success, true, 'Dossier must succeed');
  assert.strictEqual(dossier.domain, testDomain, 'Domain must match');
  assert.ok(Array.isArray(dossier.ranked_pins), 'ranked_pins must be an array');
  assert.ok(dossier.ranked_pins.length > 0, 'ranked_pins should have pins for payhip.com');
  assert.ok(Array.isArray(dossier.money_urls), 'money_urls must be an array');
  assert.ok(Array.isArray(dossier.keyword_monopoly), 'keyword_monopoly must be an array');
  assert.ok(Array.isArray(dossier.accounts), 'accounts must be an array');
  assert.ok(typeof dossier.summary?.total_saves === 'number', 'total_saves must be a number');
  assert.ok(typeof dossier.needs_age_enrichment === 'boolean', 'needs_age_enrichment must be a boolean');
  assert.ok(typeof dossier.needs_ad_enrichment === 'boolean', 'needs_ad_enrichment must be a boolean');

  console.log(`  ✓ Total Pins: ${dossier.summary.total_pins}`);
  console.log(`  ✓ Unique URLs: ${dossier.summary.unique_urls}`);
  console.log(`  ✓ Total Saves: ${dossier.summary.total_saves}`);
  console.log(`  ✓ Accounts: ${dossier.summary.accounts_count}`);
  console.log(`  ✓ Needs Age Enrichment: ${dossier.needs_age_enrichment}`);
  console.log(`  ✓ Needs Ad Enrichment: ${dossier.needs_ad_enrichment}`);
  assert.ok(coldLatencyMs < 18000, `Expected cold latency < 18000ms (preventing frontend 18s timeout), got ${coldLatencyMs}ms`);

  // 1b. Benchmark warm run (re-querying warm compute)
  console.log(`\n[*] Benchmarking getDomainDeepDossier('${testDomain}', { fastPath: true }) [Warm DB]...`);
  const tWarm = performance.now();
  await getDomainDeepDossier(sql, testDomain, { env: mockEnv, fastPath: true });
  const warmLatencyMs = Math.round(performance.now() - tWarm);
  console.log(`[+] Warm DB Dossier loaded in ${warmLatencyMs}ms (expected < 5000ms)`);
  assert.ok(warmLatencyMs < 5000, `Expected warm latency < 5000ms, got ${warmLatencyMs}ms`);

  // 2. Test fastPath behavior on fetchAndCacheDomainAge for non-existent domain
  console.log('\n[*] Testing fastPath on fetchAndCacheDomainAge...');
  const fakeDomain = 'a-unique-non-existent-domain-test-12345.com';
  const ageFast = await fetchAndCacheDomainAge(sql, fakeDomain, { fastPath: true });
  assert.ok(ageFast, 'Fast path age must return an object');
  assert.strictEqual(ageFast.lookup_status, 'pending', 'Fast path status must be pending');
  assert.strictEqual(ageFast.needs_enrichment, true, 'Fast path must flag needs_enrichment');
  console.log('  ✓ fetchAndCacheDomainAge returns pending placeholder without blocking');

  // 3. Test fastPath behavior on fetchAndCacheDomainAdNetwork for non-existent domain
  console.log('\n[*] Testing fastPath on fetchAndCacheDomainAdNetwork...');
  const adFast = await fetchAndCacheDomainAdNetwork(sql, fakeDomain, { fastPath: true });
  assert.ok(adFast, 'Fast path ad network must return an object');
  assert.strictEqual(adFast.ads_txt_status, 'pending', 'Fast path ads_txt_status must be pending');
  assert.strictEqual(adFast.needs_enrichment, true, 'Fast path must flag needs_enrichment');
  console.log('  ✓ fetchAndCacheDomainAdNetwork returns pending placeholder without blocking');

  // 4. Test Worker route /api/domains/dossier with Workers KV Edge Caching
  console.log('\n[*] Testing Worker route /api/domains/dossier with KV edge caching...');
  const routeUrl = `https://engine.internal/api/domains/dossier?domain=${encodeURIComponent(testDomain)}`;

  // Cold request (miss)
  const tWorker0 = performance.now();
  const workerRes1 = await worker.fetch(new Request(routeUrl), mockEnv);
  const workerLatency1 = Math.round(performance.now() - tWorker0);
  assert.strictEqual(workerRes1.status, 200, 'Worker response must be 200');
  const workerData1 = await workerRes1.json();
  assert.strictEqual(workerData1.success, true);
  console.log(`  ✓ Worker Cold Request: ${workerLatency1}ms`);

  // Verify KV was populated
  const kvKey = `dossier:domain:${testDomain}`;
  const inKv = await mockKvStore.get(kvKey, { type: 'json' });
  assert.ok(inKv, 'KV must have cached the dossier');
  assert.strictEqual(inKv.domain, testDomain);
  console.log(`  ✓ KV Key '${kvKey}' cached successfully`);

  // Warm request (KV hit)
  const tWorker1 = performance.now();
  const workerRes2 = await worker.fetch(new Request(routeUrl), mockEnv);
  const workerLatency2 = Math.round(performance.now() - tWorker1);
  assert.strictEqual(workerRes2.status, 200);
  console.log(`  ✓ Worker Warm KV Request: ${workerLatency2}ms (expected < 100ms)`);
  assert.ok(workerLatency2 < 200, `Warm KV response should be fast, got ${workerLatency2}ms`);

  // Force refresh bypass
  console.log('\n[*] Testing force=true cache bypass...');
  const forceRes = await worker.fetch(new Request(`${routeUrl}&force=true`), mockEnv);
  assert.strictEqual(forceRes.status, 200);
  const forceData = await forceRes.json();
  assert.strictEqual(forceData.success, true);
  console.log('  ✓ Force refresh bypasses cache cleanly');

  // 5. Test Pillar 4 Mixed-Case Sybil Network Discovery
  console.log('\n[*] Testing Pillar 4 mixed-case creator discovery (healthychicken365.com)...');
  const sybilDossier = await getDomainDeepDossier(sql, 'healthychicken365.com', { env: mockEnv, fastPath: true });
  assert.ok(sybilDossier?.success, 'healthychicken365 dossier should succeed');
  const targetAcc = sybilDossier.accounts.find(a => a.username === 'healthychicken365back');
  assert.ok(targetAcc, 'healthychicken365back should be found in accounts');
  assert.ok(Array.isArray(targetAcc.sister_domains), 'sister_domains must be an array');
  const hasVideoReddit = targetAcc.sister_domains.some(s => s.domain === 'videoreddit.edu.vn');
  assert.ok(hasVideoReddit, 'Pillar 4 must find sister domain videoreddit.edu.vn for mixed-case healthychicken365Back');
  console.log('  ✓ Mixed-case creator healthychicken365Back correctly matched sister domains in Pillar 4');

  // 6. Test Empty Domain Dossier Assembly
  console.log('\n[*] Testing empty/non-existent domain assembly...');
  const emptyDossier = await getDomainDeepDossier(sql, 'empty-domain-test-xyz-99.org', { env: mockEnv, fastPath: true });
  assert.ok(emptyDossier?.success, 'Empty domain should return success: true');
  assert.strictEqual(emptyDossier.summary.total_pins, 0, 'Total pins must be 0');
  assert.strictEqual(emptyDossier.summary.accounts_count, 0, 'Accounts count must be 0');
  console.log('  ✓ Empty domain assembled safely without errors');

  // 7. Test Pending Fast-Path KV Expiration TTL
  console.log('\n[*] Testing pending fast-path short KV expiration TTL...');
  const pendingDomain = `pending-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.com`;
  const pendingUrl = `https://engine.internal/api/domains/dossier?domain=${encodeURIComponent(pendingDomain)}`;
  await worker.fetch(new Request(pendingUrl), mockEnv);
  const pendingKvOpts = mockKvOpts.get(`dossier:domain:${pendingDomain}`);
  assert.ok(pendingKvOpts, 'Pending domain should be stored in KV');
  assert.strictEqual(pendingKvOpts.expirationTtl, 30, 'Pending domain must use 30s TTL, not 900s');
  console.log('  ✓ Pending domain dossier uses safe 30s KV TTL (preventing 15-minute lock-in)');

  console.log('\n================================================================================');
  console.log('🎉 ALL BENCHMARK & VERIFICATION CHECKS PASSED');
  console.log('================================================================================\n');
}

runBenchmark().catch(err => {
  console.error('[-] Benchmark failed:', err);
  process.exit(1);
});
