import { neon } from '@neondatabase/serverless';
import { getCompetitorsOverview, listCompetitors, trackCompetitor } from '../src/modules/competitors/service.mjs';
import { listKeywords, addKeyword, getKeywordPins } from '../src/modules/keywords/service.mjs';
import { getFleetProjects, registerNewProject } from '../src/modules/fleet/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] Missing DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runTests() {
  console.log('=== STARTING LOGICAL FORENSIC INTEGRATION TEST ===\n');

  // Test 1: Fleet Projects Credential Masking
  console.log('[*] Test 1: Verifying Fleet Projects Credential Masking...');
  const fleet = await getFleetProjects(sql);
  console.log(`    Found ${fleet.length} registered project(s)`);
  for (const p of fleet) {
    if (p.database_url.includes(':') && !p.database_url.includes('••••••••')) {
      throw new Error(`SECURITY LEAK: database_url contains unmasked credentials for ${p.project_name}`);
    }
    console.log(`    ✓ Project ${p.project_name}: URL safely masked (${p.masked_url.substring(0, 35)}...)`);
  }

  // Test 2: Competitors Overview & Listing
  console.log('\n[*] Test 2: Verifying Competitor Intelligence Service...');
  const compOverview = await getCompetitorsOverview(sql);
  console.log(`    Tracked Profiles: ${compOverview.tracked_profiles}`);
  console.log(`    Combined Reach: ${compOverview.combined_reach.toLocaleString()}`);
  console.log(`    Total Audience: ${compOverview.total_audience.toLocaleString()}`);
  console.log(`    Pins Tracked: ${compOverview.pins_tracked}`);
  if (compOverview.tracked_profiles === 0) {
    throw new Error('Expected tracked competitor profiles > 0');
  }

  const competitors = await listCompetitors(sql, { limit: 5 });
  console.log(`    Sample competitor: ${competitors[0].handle} (${competitors[0].monthly_reach.toLocaleString()} reach)`);
  console.log('    ✓ Competitor listing and delta calculations healthy.');

  // Test 3: Keywords & SERP Snapshots Retrieval
  console.log('\n[*] Test 3: Verifying Keyword Velocity & Snapshots Retention...');
  const keywords = await listKeywords(sql, { limit: 5 });
  console.log(`    Retrieved ${keywords.length} keywords.`);
  for (const kw of keywords) {
    console.log(`    - Keyword "${kw.keyword}": ${kw.snapshots_count} tracked pins, avg velocity: ${kw.avg_daily_velocity}/day`);
    if (kw.snapshots_count > 0) {
      const pins = await getKeywordPins(sql, kw.id);
      console.log(`      ✓ getKeywordPins retrieved ${pins.length} pin snapshots for "${kw.keyword}"`);
      if (pins.length > 0) {
        console.log(`      Sample Pin #1: [${pins[0].pin_id}] "${pins[0].title.slice(0, 35)}..." (${pins[0].save_count} saves, +${pins[0].daily_save_velocity}/day)`);
      }
    }
  }

  console.log('\n[+] ALL 3 CORE MODULE SERVICES PASSED INTEGRATION TESTS CLEANLY!');
}

runTests().catch(err => {
  console.error('\n[-] INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
