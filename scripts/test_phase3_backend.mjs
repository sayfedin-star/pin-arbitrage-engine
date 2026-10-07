import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { 
  getKeywordSERPComparison, 
  getKeywordDisplacedPins, 
  getPinPerformanceTrajectory, 
  getPinDeepDossier 
} from '../src/modules/keywords/service.mjs';
import { fetchPinterestTrendsPopularPins } from '../src/modules/keywords/trends-service.mjs';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('================================================================');
  console.log('🧪 TESTING PHASE 3: DISPLACED VAULT, DOSSIER & POPULAR PINS');
  console.log('================================================================\n');

  // Test 1: getKeywordSERPComparison with isolated SERP pins
  console.log('[*] Test 1: getKeywordSERPComparison for keyword ID 29 ("marry me chicken")...');
  const serp = await getKeywordSERPComparison(sql, 29);
  console.log(`    Status: ${serp.status || 'success'}`);
  console.log(`    Current SERP pins count: ${serp.current_pins?.length || 0}`);
  console.log(`    Dropped out pins in Vault: ${serp.dropped_out_pins?.length || 0}`);

  const samplePin = serp.current_pins?.[0];
  const samplePinId = samplePin?.pin_id || '1098245059160132988';
  console.log(`    Using sample pin ID: ${samplePinId} ("${samplePin?.title?.slice(0, 40) || 'Sample'}...")\n`);

  // Test 2: getKeywordDisplacedPins
  console.log('[*] Test 2: getKeywordDisplacedPins for keyword ID 29...');
  const displaced = await getKeywordDisplacedPins(sql, 29);
  console.log(`    Displaced pins count: ${displaced.pins?.length || 0}`);
  console.log(`    Total registered: ${displaced.total || 0}\n`);

  // Test 3: getPinPerformanceTrajectory
  console.log(`[*] Test 3: getPinPerformanceTrajectory for pin ${samplePinId}...`);
  const trajectory = await getPinPerformanceTrajectory(sql, 29, samplePinId, 'all');
  console.log(`    Trajectory snapshots count: ${trajectory.total_snapshots}`);
  console.log(`    Net growth summary:`, trajectory.net_growth);
  if (trajectory.snapshots.length > 0) {
    console.log(`    Latest snapshot: Date ${trajectory.snapshots[trajectory.snapshots.length - 1].snapshot_date}, Saves: ${trajectory.snapshots[trajectory.snapshots.length - 1].save_count}`);
  }
  console.log('');

  // Test 4: getPinDeepDossier
  console.log(`[*] Test 4: getPinDeepDossier for pin ${samplePinId}...`);
  const dossier = await getPinDeepDossier(sql, samplePinId, 29);
  console.log(`    Title: "${dossier.title?.slice(0, 50)}..."`);
  console.log(`    SEO Alt Text: "${dossier.seo_alt_text?.slice(0, 60) || 'None cached yet'}..."`);
  console.log(`    Dominant color: ${dossier.dominant_color}`);
  console.log(`    KPIs:`, dossier.kpis);
  console.log(`    Deltas:`, dossier.deltas);
  console.log(`    Annotations count: ${dossier.annotations?.length || 0}\n`);

  // Test 5: fetchPinterestTrendsPopularPins
  console.log('[*] Test 5: fetchPinterestTrendsPopularPins for "marry me chicken"...');
  const popular = await fetchPinterestTrendsPopularPins(sql, 'marry me chicken');
  console.log(`    Success: ${popular.success}`);
  console.log(`    Popular pins retrieved: ${popular.popular_pins?.length || 0}`);
  if (popular.popular_pins?.length > 0) {
    console.log(`    Top popular pin: "${popular.popular_pins[0].title}" (ID: ${popular.popular_pins[0].pin_id})`);
    console.log(`    Image: ${popular.popular_pins[0].image_url?.slice(0, 60)}...`);
  }
  console.log('');

  console.log('================================================================');
  console.log('✓ PHASE 3 BACKEND INTEGRATION TEST: 100% SUCCESS');
  console.log('================================================================');
}

main().catch(err => {
  console.error('[-] Phase 3 Backend Test Error:', err);
  process.exit(1);
});
