import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import worker from '../src/worker.mjs';

let dbUrl = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'DATABASE_URL') dbUrl = val;
    }
  }
} catch (_) {}

const env = { DATABASE_URL: dbUrl };
const sql = neon(dbUrl);

console.log('--- 1. Testing Prefetch HTTP 200 OK on Cache Miss ---');
const prefetchReq = new Request('http://localhost/api/pins/999999999999999999?prefetch=true');
const prefetchRes = await worker.fetch(prefetchReq, env);
const prefetchJson = await prefetchRes.json();
console.log('Prefetch Status:', prefetchRes.status);
console.log('Prefetch Cache-Control:', prefetchRes.headers.get('cache-control'));
console.log('Prefetch Body:', prefetchJson);
if (prefetchRes.status !== 200 || prefetchJson.status !== 'cache_miss') {
  throw new Error('Prefetch did not return 200 with status: cache_miss');
}

console.log('\n--- 2. Testing Sub-Route: GET /api/folders/5/creators ---');
const creatorsReq = new Request('http://localhost/api/folders/5/creators');
const creatorsRes = await worker.fetch(creatorsReq, env);
const creatorsJson = await creatorsRes.json();
console.log('Creators Status:', creatorsRes.status);
console.log('Creators Response:', creatorsJson);
if (creatorsRes.status !== 200 || !creatorsJson.success || !Array.isArray(creatorsJson.creators)) {
  throw new Error('GET /api/folders/5/creators failed');
}

console.log('\n--- 3. Testing Sub-Route: GET /api/folders/5/domains ---');
const domainsReq = new Request('http://localhost/api/folders/5/domains');
const domainsRes = await worker.fetch(domainsReq, env);
const domainsJson = await domainsRes.json();
console.log('Domains Status:', domainsRes.status);
console.log('Domains Response:', domainsJson);
if (domainsRes.status !== 200 || !domainsJson.success || !Array.isArray(domainsJson.domains)) {
  throw new Error('GET /api/folders/5/domains failed');
}

console.log('\n--- 4. Testing Domain Pinning & Unpinning & Accidental Folder Deletion Prevention ---');
const testDomain = 'arbitrage-test-unit.com';
const pinReq = new Request('http://localhost/api/folders/5/domains', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domain: testDomain, notes: 'Automated test pin' })
});
const pinRes = await worker.fetch(pinReq, env);
const pinJson = await pinRes.json();
console.log('Pin Domain Response:', pinJson);

// Now UNPIN the domain via DELETE
const unpinReq = new Request(`http://localhost/api/folders/5/domains/${testDomain}`, {
  method: 'DELETE'
});
const unpinRes = await worker.fetch(unpinReq, env);
const unpinJson = await unpinRes.json();
console.log('Unpin Domain Response:', unpinJson);

// Verify Folder 5 is STILL INTACT!
const checkFolderReq = new Request('http://localhost/api/folders/5');
const checkFolderRes = await worker.fetch(checkFolderReq, env);
const checkFolderJson = await checkFolderRes.json();
console.log('Check Folder 5 Status after unpin:', checkFolderRes.status);
console.log('Folder 5 Name:', checkFolderJson.folder?.name);
if (checkFolderRes.status !== 200 || !checkFolderJson.folder?.name) {
  throw new Error('FATAL: Folder 5 was deleted by unpinning a domain!');
}
console.log('✅ P0 Accidental Deletion Landmine successfully eliminated: Folder 5 is 100% intact!');

console.log('\n--- 5. Testing Crossover Latency ---');
const t0 = performance.now();
const crossReq = new Request('http://localhost/api/folders/6/raw-visual-crossover?refresh=true');
const crossRes = await worker.fetch(crossReq, env);
const crossDuration = performance.now() - t0;
const crossJson = await crossRes.json();
console.log(`Crossover status: ${crossRes.status}, duration: ${Math.round(crossDuration)}ms`);
console.log('Monopoly domains count:', crossJson.crossover?.domain_monopoly?.length || crossJson.domain_monopoly?.length);
console.log('Super pins count:', crossJson.crossover?.super_pins?.length || crossJson.super_pins?.length);

console.log('\n--- 6. Testing Mathematical Parity for Folder 5 and Folder 6 ---');
const f5Req = new Request('http://localhost/api/folders/5');
const f5Res = await worker.fetch(f5Req, env);
const f5Json = await f5Res.json();
console.log('Folder 5 domain_count:', f5Json.folder?.domain_count);

const f6Req = new Request('http://localhost/api/folders/6');
const f6Res = await worker.fetch(f6Req, env);
const f6Json = await f6Res.json();
console.log('Folder 6 domain_count:', f6Json.folder?.domain_count);

if (f5Json.folder?.domain_count !== 312 || f6Json.folder?.domain_count !== 328) {
  throw new Error(`Mathematical disparity: expected 312 and 328, got ${f5Json.folder?.domain_count} and ${f6Json.folder?.domain_count}`);
}
console.log('✅ 100% Mathematical Domain Count Parity Certified: 312 for Folder #5, 328 for Folder #6!');
