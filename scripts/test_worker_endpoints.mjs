import fs from 'fs';

// Load .env manually
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        process.env[key] = val;
      }
    }
  }
} catch (_) {}

import worker from '../src/worker.mjs';

async function testEndpoint(name, url) {
  console.log(`[*] Testing ${name}: ${url}...`);
  const req = new Request(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  const env = {
    DATABASE_URL: process.env.DATABASE_URL
  };
  const res = await worker.fetch(req, env);
  console.log(`    Status: ${res.status} ${res.statusText}`);
  if (res.status !== 200) {
    const text = await res.text();
    console.error(`    Error Body: ${text}`);
    throw new Error(`Endpoint ${name} failed with status ${res.status}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    console.log(`    Response keys: ${Object.keys(json).join(', ')}`);
    return json;
  } else {
    const text = await res.text();
    console.log(`    HTML length: ${text.length} chars (includes DOCTYPE: ${text.includes('<!DOCTYPE html>')})`);
    return text;
  }
}

async function run() {
  console.log('================================================================');
  console.log('🧪 VERIFYING WORKER ENDPOINTS & KEYWORDS UI ROUTING');
  console.log('================================================================\n');

  // 1. Keywords UI page render
  await testEndpoint('Keywords UI Page', 'http://localhost/keywords');

  // 2. Displaced Pins Vault API
  const displaced = await testEndpoint('Displaced Pins API', 'http://localhost/api/keywords/displaced?keyword_id=29');
  console.log(`    Displaced Pins returned: ${displaced.displaced_pins?.length || 0}`);

  // 3. Trajectory API
  const trajectory = await testEndpoint('Trajectory API', 'http://localhost/api/keywords/pins/trajectory?pin_id=68750224405&keyword_id=29&range=30d');
  console.log(`    Trajectory Snapshots: ${trajectory.snapshots?.length || 0}`);

  // 4. Dossier API
  const dossier = await testEndpoint('Dossier API', 'http://localhost/api/keywords/pins/dossier?pin_id=68750224405&keyword_id=29');
  const dObj = dossier.dossier || dossier;
  console.log(`    Dossier Title: "${dObj.title}"`);
  console.log(`    Dossier Alt Text: "${dObj.seo_alt_text?.slice(0, 40)}..."`);
  console.log(`    Annotations: ${dObj.annotations?.length || 0}`);

  // 5. Popular Pins API
  const popPins = await testEndpoint('Popular Pins API', 'http://localhost/api/keywords/trends/popular-pins?term=marry%20me%20chicken');
  console.log(`    Popular Pins count: ${popPins.popular_pins?.length || 0}`);

  console.log('\n================================================================');
  console.log('✓ ALL 5 WORKER ENDPOINTS & UI RENDER PASSED 100%');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\n[-] Test Failure:', err);
  process.exit(1);
});
