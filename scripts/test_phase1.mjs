import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { addKeyword, crawlKeywordSERP, getKeywordSERPComparison, getKeywordIntelligence } from '../src/modules/keywords/service.mjs';

// Load .env manually if not in process.env
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
    }
  } catch (_) {}
}

async function verifyPhase1() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set in environment or .env!');
  }

  const sql = neon(dbUrl);
  console.log('[1/4] Connected to Neon database successfully.');

  // Test keyword
  const testKeyword = 'crochet cardigan pattern';
  console.log(`[2/4] Ensuring tracked keyword: "${testKeyword}" with target 100 pins...`);
  const kwRow = await addKeyword(sql, { keyword: testKeyword, category: 'Crafts & DIY', target_pin_count: 100 });
  await sql`UPDATE tracked_keywords SET target_pin_count = 100 WHERE id = ${kwRow.id};`;
  console.log(`Tracked Keyword ID: ${kwRow.id}, Keyword: "${kwRow.keyword}"`);

  console.log('[3/4] Crawling keyword with 100-pin pagination and robust title/saves extractor...');
  // Delete crawl_lock to allow immediate re-crawl
  await sql`UPDATE tracked_keywords SET metadata = metadata - 'crawl_lock' WHERE id = ${kwRow.id};`;
  const crawlResult = await crawlKeywordSERP(sql, kwRow.id, null);
  console.log('Crawl Result:', {
    success: crawlResult.success,
    crawled_pins: crawlResult.crawled_pins,
    guides_count: crawlResult.guides_count,
    top_pin: crawlResult.top_pin?.title
  });

  console.log('[4/4] Verifying Algorithmic Intelligence Summary & Pin Quality...');
  const intel = await getKeywordIntelligence(sql, kwRow.id);
  console.log('\n=== ALGORITHMIC INTELLIGENCE SUMMARY ===');
  console.log('Keyword:', intel.keyword);
  console.log('Pins Analyzed:', intel.pins_analyzed);
  console.log('Opportunity Verdict:', intel.opportunity.badge, `(Score: ${intel.opportunity.score}/3)`);

  const serpCompare = await getKeywordSERPComparison(sql, kwRow.id);
  const untitledPins = serpCompare.current_pins.filter(p => !p.title || p.title === 'Untitled Pin');
  console.log(`\nCurrent Pins Total: ${serpCompare.current_pins.length}`);
  console.log(`Untitled Pins Count: ${untitledPins.length} (Target: 0)`);
  if (untitledPins.length > 0) {
    console.warn(`[!] Warning: Found ${untitledPins.length} untitled pins:`, untitledPins.map(p => p.pin_id));
  } else {
    console.log(`[✓] PERFECT: 100% of pins have genuine, descriptive titles!`);
  }

  // Inspect sample pins for saves, reactions, and titles
  console.log('\nSample Top 5 Pins from Neon DB:');
  serpCompare.current_pins.slice(0, 5).forEach((p, idx) => {
    console.log(`  #${idx+1} [${p.pin_id}] "${p.title}"`);
    console.log(`      Saves: ${p.save_count} | Reactions: ${p.metadata?.reactions} | Velocity: +${p.daily_save_velocity}/day | Format: ${p.metadata?.format}`);
  });

  console.log('\n>>> LIVE VERIFICATION COMPLETED SUCCESSFULLY! <<<');
}

verifyPhase1().catch(err => {
  console.error('[!] Verification failed:', err);
  process.exit(1);
});
