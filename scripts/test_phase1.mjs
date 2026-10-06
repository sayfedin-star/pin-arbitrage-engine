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
  console.log(`[2/4] Ensuring tracked keyword: "${testKeyword}"...`);
  const kwRow = await addKeyword(sql, { keyword: testKeyword, category: 'Crafts & DIY', target_pin_count: 50 });
  console.log(`Tracked Keyword ID: ${kwRow.id}, Keyword: "${kwRow.keyword}"`);

  console.log('[3/4] Inspecting raw Pinterest search results for annotation locations...');
  const testQuery = encodeURIComponent(testKeyword);
  const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${testQuery}&data=%7B%22options%22%3A%7B%22query%22%3A%22${testQuery}%22%2C%22scope%22%3A%22pins%22%2C%22page_size%22%3A10%7D%2C%22context%22%3A%7B%7D%7D`;
  const rawHeaders = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'x-pinterest-pws-handler': 'www/search/pins.js',
    'referer': `https://www.pinterest.com/search/pins/?q=${testQuery}`
  };
  if (process.env.PINTEREST_COOKIE) {
    rawHeaders['Cookie'] = process.env.PINTEREST_COOKIE;
  }
  const rawRes = await fetch(searchUrl, { headers: rawHeaders });
  const rawData = await rawRes.json();
  const rawItems = rawData?.resource_response?.data?.results || [];
  rawItems.slice(0, 8).forEach((item, idx) => {
    console.log(`Pin #${idx+1} (${item.id}):`);
    console.log('  type:', item.type, 'is_video:', item.is_video, 'has_story:', Boolean(item.story_pin_data));
    console.log('  pin_join keys:', item.pin_join ? Object.keys(item.pin_join) : null);
    console.log('  pin_join.visual_annotation:', item.pin_join?.visual_annotation);
    console.log('  pin_join.annotations:', item.pin_join?.annotations);
    console.log('  item.visual_annotation:', item.visual_annotation);
    console.log('  story_pin_data keys:', item.story_pin_data ? Object.keys(item.story_pin_data) : null);
  });

  console.log('[3/4] Crawling keyword anonymously to verify full computer-vision extraction...');
  // Delete crawl_lock to allow immediate re-crawl
  await sql`UPDATE tracked_keywords SET metadata = metadata - 'crawl_lock' WHERE id = ${kwRow.id};`;
  const crawlResult = await crawlKeywordSERP(sql, kwRow.id, null);
  console.log('Crawl Result:', {
    success: crawlResult.success,
    crawled_pins: crawlResult.crawled_pins,
    guides_count: crawlResult.guides_count,
    top_pin: crawlResult.top_pin?.title
  });

  console.log('[4/4] Verifying Algorithmic Intelligence Summary...');
  const intel = await getKeywordIntelligence(sql, kwRow.id);
  console.log('\n=== ALGORITHMIC INTELLIGENCE SUMMARY ===');
  console.log('Keyword:', intel.keyword);
  console.log('Pins Analyzed:', intel.pins_analyzed);
  console.log('Opportunity Verdict:', intel.opportunity.badge, `(Score: ${intel.opportunity.score}/3)`);
  console.log('Opportunity Summary:', intel.opportunity.summary);
  console.log('\nCriteria Evaluation:');
  for (const c of intel.opportunity.criteria) {
    console.log(`  - [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}: ${c.metric} (Benchmark: ${c.benchmark})`);
  }
  console.log('\nSERP Benchmarks (Medians):', intel.benchmarks);
  console.log('Formats Breakdown (%):', intel.formats);
  console.log('Aspect Ratios (%):', intel.aspect_ratios);
  console.log('Copywriting Patterns:', intel.copywriting);
  console.log(`\nVisual Annotations Cloud (${intel.visual_annotations.length} unique tags detected):`);
  console.log(intel.visual_annotations.slice(0, 8));

  // Also verify SERP Comparison includes intelligence
  const serpCompare = await getKeywordSERPComparison(sql, kwRow.id);
  if (!serpCompare.intelligence) {
    throw new Error('getKeywordSERPComparison does not contain intelligence property!');
  }
  if (!serpCompare.current_pins[0]?.metadata?.visual_annotations) {
    throw new Error('Snapshots do not have visual_annotations in metadata!');
  }
  console.log('\n[+] Raw metadata of Pin #2:');
  console.log(JSON.stringify(serpCompare.current_pins[1].metadata, null, 2));
  console.log('\n>>> PHASE 1 LIVE VERIFICATION 100% SUCCESSFUL! <<<');
}

verifyPhase1().catch(err => {
  console.error('[!] Verification failed:', err);
  process.exit(1);
});
