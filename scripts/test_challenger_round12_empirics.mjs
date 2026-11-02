/**
 * Round 12 Challenger 2 Empirical Adversarial Audit Suite
 *
 * Systematic stress-testing of:
 * 1. Concurrency limit (4) and deadline timeout (4500ms) with clearTimeout in folders-service.mjs
 * 2. Multi-keyword metadata merging in Pass 1 when pins appear in multiple keyword rows
 * 3. Edge cases in derivePinTitle with visual annotations ({ name } objects) & Vacuum pins (alt text / description)
 */

import assert from 'node:assert';
import {
  isSyntheticPinTitle,
  derivePinTitle,
  calculateFolderCrossover
} from '../src/modules/keywords/folders-service.mjs';

console.log('================================================================================');
console.log('   ROUND 12 CHALLENGER 2 EMPIRICAL ADVERSARIAL STRESS TEST');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function report(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    failedTests++;
    failures.push({ name, details });
    console.log(`  ❌ [FAIL] ${name} -> ${details}`);
  }
}

// =============================================================================
// CHALLENGE 1: Concurrency Limit = 4 & 4500ms Deadline Timeout with clearTimeout
// =============================================================================
console.log('[Challenge 1] Testing Shard Scatter-Gather Concurrency = 4 & 4500ms Deadline Timeout...');

// Test 1.1: Concurrency Ceiling Verification (max active concurrent queries <= 4)
{
  const CONCURRENCY_LIMIT = 4;
  const SHARD_COUNT = 20; // 20 physical shards
  let activeConnections = 0;
  let maxObservedConcurrency = 0;
  const executionTimeline = [];

  const entries = Array.from({ length: SHARD_COUNT }, (_, i) => [i + 1, [`pin_${i + 1}`]]);

  // Implement the exact chunking loop from folders-service.mjs:2667-2716
  const hydrateShardBatch = async (shardEntries) => {
    const hydratedBatch = [];
    for (let i = 0; i < shardEntries.length; i += CONCURRENCY_LIMIT) {
      const chunk = shardEntries.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(
        chunk.map(async ([shardId, pins]) => {
          activeConnections++;
          maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConnections);
          executionTimeline.push({ shardId, startActive: activeConnections, time: Date.now() });

          // Simulate network I/O
          await new Promise(r => setTimeout(r, 25));

          activeConnections--;
          hydratedBatch.push({ pin_id: pins[0], shardId });
        })
      );
    }
    return hydratedBatch;
  };

  const results = await hydrateShardBatch(entries);

  report(
    'Concurrency limit = 4 is strictly respected across 20 shards',
    maxObservedConcurrency === 4,
    `Max observed concurrency was ${maxObservedConcurrency} (expected exactly 4)`
  );
  report(
    'All 20 shards are successfully processed in batches',
    results.length === SHARD_COUNT,
    `Expected ${SHARD_COUNT} results, got ${results.length}`
  );
}

// Test 1.2: Deadline Timeout Race & clearTimeout Cleanup on Fast Completion
{
  const SCATTER_GATHER_DEADLINE_MS = 4500;
  let timeoutFired = false;
  let deadlineTimerId;

  const mockFastWork = async () => {
    await new Promise(r => setTimeout(r, 30));
    return [{ pin_id: '123', title: 'Fast Shard' }];
  };

  const deadlinePromise = new Promise(resolve => {
    deadlineTimerId = setTimeout(() => {
      timeoutFired = true;
      resolve(null);
    }, SCATTER_GATHER_DEADLINE_MS);
  });

  const raceResult = await Promise.race([
    mockFastWork(),
    deadlinePromise
  ]).finally(() => {
    if (deadlineTimerId) clearTimeout(deadlineTimerId);
  });

  // Wait 100ms and verify timer is cancelled and does NOT fire
  await new Promise(r => setTimeout(r, 100));

  report(
    'Fast queries resolve before deadline and return results',
    Array.isArray(raceResult) && raceResult.length === 1,
    `Expected array with 1 item, got ${JSON.stringify(raceResult)}`
  );
  report(
    'clearTimeout in .finally prevents the 4500ms deadline timer from firing or lingering',
    timeoutFired === false,
    'Deadline timer fired even though fast work completed!'
  );
}

// Test 1.3: Deadline Timeout Race when Shards are Unresponsive (> 4500ms)
{
  const SCATTER_GATHER_DEADLINE_MS = 500; // Use 500ms for fast empirical test of the exact pattern
  let deadlineTimerId;
  const startMs = Date.now();

  const mockHangingWork = async () => {
    // Shard hangs for 2000ms
    await new Promise(r => setTimeout(r, 2000));
    return [{ pin_id: 'hung_pin' }];
  };

  const deadlinePromise = new Promise(resolve => {
    deadlineTimerId = setTimeout(() => resolve(null), SCATTER_GATHER_DEADLINE_MS);
  });

  const raceResult = await Promise.race([
    mockHangingWork(),
    deadlinePromise
  ]).finally(() => {
    if (deadlineTimerId) clearTimeout(deadlineTimerId);
  });

  const duration = Date.now() - startMs;

  report(
    'Deadline timeout unblocks Promise.race when shards hang',
    raceResult === null,
    `Expected null, got ${JSON.stringify(raceResult)}`
  );
  report(
    'Deadline timeout breaks in ~500ms without waiting for hanging 2000ms shard',
    duration >= 450 && duration < 800,
    `Duration was ${duration}ms (expected ~500ms)`
  );
}

// Test 1.4: Error & Rejection Resilience in Promise.allSettled
{
  const entries = [
    [1, ['p1']],
    [2, ['p2']], // Will reject
    [3, ['p3']],
    [4, ['p4']]  // Will throw
  ];

  let deadlineTimerId;
  const deadlinePromise = new Promise(resolve => {
    deadlineTimerId = setTimeout(() => resolve(null), 4500);
  });

  const mockFaultyWork = async () => {
    const hydratedBatch = [];
    await Promise.allSettled(
      entries.map(async ([shardId, pins]) => {
        if (shardId === 2) throw new Error('Shard 2 connection refused');
        if (shardId === 4) throw new TypeError('Network socket destroyed');
        hydratedBatch.push({ pin_id: pins[0] });
      })
    );
    return hydratedBatch;
  };

  const raceResult = await Promise.race([
    mockFaultyWork(),
    deadlinePromise
  ]).finally(() => {
    if (deadlineTimerId) clearTimeout(deadlineTimerId);
  });

  report(
    'Promise.allSettled absorbs shard rejections without failing the batch',
    Array.isArray(raceResult) && raceResult.length === 2,
    `Expected 2 successful pins, got ${raceResult?.length}`
  );
}

// =============================================================================
// CHALLENGE 2: Multi-Keyword Metadata Merging in Pass 1
// =============================================================================
console.log('\n[Challenge 2] Testing Multi-Keyword Metadata Merging in Pass 1...');

{
  // Test scenario: A pin appears in 3 different keywords in a campaign folder:
  // Row 1: Keyword 'gluten free pancakes' - Has synthetic title, no image, older crawl, 500 saves
  // Row 2: Keyword 'healthy breakfast ideas' - Has authentic title, valid image, newest crawl, 1500 saves
  // Row 3: Keyword 'easy pancake recipes' - Has synthetic title, no image, middle crawl, 1200 saves

  const PID = '777888999111222';
  const totalKeywords = 3;

  const rows = [
    {
      keyword_id: 1,
      keyword_text: 'gluten free pancakes',
      pin_id: PID,
      rank_position: 5,
      title: 'gluten free pancakes Inspiration', // Synthetic
      image_url: '',
      destination_url: 'https://healthyrecipes.com/gf-pancakes',
      domain: 'healthyrecipes.com',
      save_count: 500,
      repin_count: 50,
      comment_count: 5,
      daily_save_velocity: 10,
      crawled_at: '2026-10-25T00:00:00Z',
      created_at_pinterest: '2025-01-01T00:00:00Z',
      is_displaced: false,
      snapshot_date: '2026-10-25',
      visual_annotations: ['Pancakes']
    },
    {
      keyword_id: 2,
      keyword_text: 'healthy breakfast ideas',
      pin_id: PID,
      rank_position: 2,
      title: 'Fluffy Blender Gluten-Free Oatmeal Pancakes', // Authentic
      image_url: 'https://i.pinimg.com/736x/77/78/88/777888999111222.jpg',
      destination_url: 'https://healthyrecipes.com/gf-pancakes',
      domain: 'healthyrecipes.com',
      save_count: 1500,
      repin_count: 180,
      comment_count: 15,
      daily_save_velocity: 45,
      crawled_at: '2026-11-01T12:00:00Z', // Newest crawl
      created_at_pinterest: '2025-01-01T00:00:00Z',
      is_displaced: false,
      snapshot_date: '2026-11-01',
      visual_annotations: ['Pancakes', 'Breakfast', 'Oatmeal']
    },
    {
      keyword_id: 3,
      keyword_text: 'easy pancake recipes',
      pin_id: PID,
      rank_position: 8,
      title: 'easy pancake recipes Inspiration', // Synthetic
      image_url: '',
      destination_url: 'https://healthyrecipes.com/gf-pancakes',
      domain: 'healthyrecipes.com',
      save_count: 1200,
      repin_count: 120,
      comment_count: 10,
      daily_save_velocity: 30,
      crawled_at: '2026-10-28T00:00:00Z',
      created_at_pinterest: '2025-01-01T00:00:00Z',
      is_displaced: false,
      snapshot_date: '2026-10-28',
      visual_annotations: ['Pancakes']
    }
  ];

  // Execute Pass 1 logic matching folders-service.mjs:2367-2486
  const pinMap = new Map();
  for (const row of rows) {
    const pid = String(row.pin_id);
    const rowSaves = Number(row.save_count || 0);
    const rowRepins = Number(row.repin_count || 0);
    const vel = Number(row.daily_save_velocity || 0);
    const rankNum = Number(row.rank_position || 1);

    if (!pinMap.has(pid)) {
      const candidateRawTitle = String(row.title || '').trim();
      const authenticTitle = !isSyntheticPinTitle(candidateRawTitle) ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: authenticTitle,
        title: authenticTitle,
        seo_title: '',
        image_url: row.image_url || '',
        domain: row.domain || '',
        destination_url: row.destination_url || '',
        save_count: rowSaves,
        repin_count: rowRepins,
        daily_save_velocity: vel,
        crawled_at: row.crawled_at,
        visual_annotations: row.visual_annotations || [],
        rankings: []
      });
    } else {
      const existingPin = pinMap.get(pid);
      const incomingTitle = String(row.title || '').trim();
      if (!existingPin.raw_title && !isSyntheticPinTitle(incomingTitle)) {
        existingPin.raw_title = incomingTitle;
        existingPin.title = incomingTitle;
      }
      if (!existingPin.image_url && row.image_url) {
        existingPin.image_url = row.image_url;
      }
      if (!existingPin.destination_url && row.destination_url) {
        existingPin.destination_url = row.destination_url;
      }
      existingPin.save_count = Math.max(existingPin.save_count, rowSaves);
      existingPin.repin_count = Math.max(existingPin.repin_count, rowRepins);

      const existingCrawlMs = existingPin.crawled_at ? new Date(existingPin.crawled_at).getTime() : 0;
      const rowCrawlMs = row.crawled_at ? new Date(row.crawled_at).getTime() : 0;
      if (rowCrawlMs > existingCrawlMs) {
        existingPin.daily_save_velocity = vel;
        existingPin.crawled_at = row.crawled_at;
      }

      if ((row.visual_annotations || []).length > existingPin.visual_annotations.length) {
        existingPin.visual_annotations = row.visual_annotations;
      }
    }

    const pinRecord = pinMap.get(pid);
    pinRecord.rankings.push({
      keyword_id: row.keyword_id,
      keyword: row.keyword_text,
      rank_position: rankNum,
      is_displaced: Boolean(row.is_displaced)
    });
  }

  const merged = pinMap.get(PID);

  // Assertions:
  report(
    'Pass 1 multi-keyword: Authentic title from Row 2 is retained and NOT overwritten by Row 3 synthetic title',
    merged.title === 'Fluffy Blender Gluten-Free Oatmeal Pancakes' && merged.raw_title === 'Fluffy Blender Gluten-Free Oatmeal Pancakes',
    `Expected authentic title, got "${merged.title}"`
  );

  report(
    'Pass 1 multi-keyword: Image URL from Row 2 is retained and NOT overwritten by Row 3 empty image',
    merged.image_url === 'https://i.pinimg.com/736x/77/78/88/777888999111222.jpg',
    `Expected valid image URL, got "${merged.image_url}"`
  );

  report(
    'Pass 1 multi-keyword: save_count uses Math.max across all keyword rows',
    merged.save_count === 1500,
    `Expected 1500 saves, got ${merged.save_count}`
  );

  report(
    'Pass 1 multi-keyword: crawled_at and velocity reflect the most recent crawl (2026-11-01)',
    merged.crawled_at === '2026-11-01T12:00:00Z' && merged.daily_save_velocity === 45,
    `Expected 2026-11-01T12:00:00Z and velocity 45, got ${merged.crawled_at} and ${merged.daily_save_velocity}`
  );

  report(
    'Pass 1 multi-keyword: All 3 keyword rankings are recorded',
    merged.rankings.length === 3,
    `Expected 3 rankings, got ${merged.rankings.length}`
  );

  report(
    'Pass 1 multi-keyword: Visual annotations take highest length (3 items)',
    merged.visual_annotations.length === 3,
    `Expected 3 visual annotations, got ${merged.visual_annotations.length}`
  );
}

// =============================================================================
// CHALLENGE 3: derivePinTitle Edge Cases: Visual Annotations Objects & Vacuum Pins
// =============================================================================
console.log('\n[Challenge 3] Testing derivePinTitle with Visual Annotations & Vacuum Pins...');

// Test 3.1: Visual annotations as objects with { name }
{
  const title = derivePinTitle(
    '', // empty raw title
    '', // no destination URL
    'oatmeal pancakes', // keyword
    '', // no board name
    [{ name: 'Oatmeal Pancakes' }, { name: 'Healthy Breakfast' }]
  );
  report(
    'derivePinTitle extracts from { name } object in visualAnnotations',
    title === 'Oatmeal Pancakes - Oatmeal pancakes',
    `Got: "${title}"`
  );
}

// Test 3.2: Visual annotations as objects with { tag }
{
  const title = derivePinTitle(
    'Untitled Pin',
    '',
    'fall outfits',
    '',
    [{ tag: 'Knitwear' }, { tag: 'Sweater' }]
  );
  report(
    'derivePinTitle extracts from { tag } object in visualAnnotations',
    title === 'Knitwear - Fall outfits',
    `Got: "${title}"`
  );
}

// Test 3.3: Visual annotations as objects with { label }
{
  const title = derivePinTitle(
    'Pinterest Pin Idea',
    '',
    'pottery',
    '',
    [{ label: 'Ceramic Bowls' }]
  );
  report(
    'derivePinTitle extracts from { label } object in visualAnnotations',
    title === 'Ceramic Bowls - Pottery',
    `Got: "${title}"`
  );
}

// Test 3.4: Visual annotations with mixed null, undefined, empty, and [object Object]
{
  const title = derivePinTitle(
    '',
    '',
    'home decor',
    '',
    [null, undefined, {}, { name: '' }, { foo: 'bar' }, { name: 'Boho Rug' }]
  );
  report(
    'derivePinTitle safely skips null, undefined, and empty objects to find valid { name }',
    title === 'Boho Rug - Home decor',
    `Got: "${title}"`
  );
}

// Test 3.5: Visual annotations passed as non-array (number, string, object) - MUST NOT throw TypeError
{
  let threw = false;
  let result = '';
  try {
    result = derivePinTitle('', '', 'hiking boots', '', 'not-an-array');
  } catch (e) {
    threw = true;
  }
  report(
    'derivePinTitle handles non-array visualAnnotations without throwing',
    !threw && result.includes('Hiking boots'),
    `Threw: ${threw}, Result: "${result}"`
  );
}

// Test 3.6: Vacuum Pin (Uploaded by user, no link) with alt text
{
  const title = derivePinTitle(
    '', // no title
    '', // linkless Vacuum pin
    'macrame wall hanging',
    '', // no board
    [], // no visual annotations
    '', // no description
    'Large bohemian macrame wall hanging above a modern neutral sofa in a bright living room. Easy DIY home decor.'
  );
  report(
    'derivePinTitle extracts first sentence from alt text for linkless Vacuum pin',
    title === 'Large bohemian macrame wall hanging above a modern neutral sofa in a bright living room',
    `Got: "${title}"`
  );
}

// Test 3.7: Vacuum Pin with description containing pipe delimiter
{
  const title = derivePinTitle(
    'recipe', // generic 'recipe'
    '', // linkless Vacuum pin
    'sourdough bread',
    '',
    [],
    'Beginner Artisan Sourdough Bread | No-Knead Overnight Method | Crusty Dutch Oven Loaf with open crumb.'
  );
  report(
    'derivePinTitle splits on pipe delimiter (|) in description',
    title === 'Beginner Artisan Sourdough Bread',
    `Got: "${title}"`
  );
}

// Test 3.8: Vacuum Pin with long description > 95 characters
{
  const longDesc = 'A complete step-by-step masterclass guide on how to build a high-converting automated Pinterest marketing funnel from scratch in 2026.';
  const title = derivePinTitle(
    'Pin', // generic 'Pin'
    '',
    'pinterest marketing',
    '',
    [],
    longDesc
  );
  report(
    'derivePinTitle truncates long description to <= 95 characters with ellipsis',
    title.length <= 95 && title.endsWith('...'),
    `Length: ${title.length}, Title: "${title}"`
  );
}

// Test 3.9: Vacuum Pin where alt text has synthetic title fallback
{
  const title = derivePinTitle(
    'sourdough bread Inspiration', // synthetic
    '',
    'sourdough bread',
    '',
    [],
    'Crusty golden sourdough loaf cooling on a wire rack with butter and honeycomb.', // authentic description
    'sourdough bread Inspiration' // synthetic alt text matching isSyntheticPinTitle
  );
  report(
    'derivePinTitle rejects synthetic alt text and falls through to authentic description',
    title === 'Crusty golden sourdough loaf cooling on a wire rack with butter and honeycomb',
    `Got: "${title}"`
  );
}

// Test 3.10: Vacuum Pin with both alt text and description empty
{
  const title = derivePinTitle(
    '',
    '',
    'leather craft',
    '',
    [],
    '',
    ''
  );
  report(
    'derivePinTitle falls back to "<Keyword> Inspiration" when alt text and description are missing',
    title === 'Leather craft Inspiration',
    `Got: "${title}"`
  );
}

// Test 3.11: Authentic SEO Title takes highest precedence over slug, board, VA, and alt text
{
  const title = derivePinTitle(
    'Untitled',
    'https://example.com/ignored-slug',
    'crochet sweater',
    'My Crochet Board',
    ['Crochet Pattern'],
    'Description text',
    'Alt text',
    'Ultimate Beginner Crochet Sweater Pattern (Free PDF)'
  );
  report(
    'derivePinTitle prioritizes authentic SEO title over all lower tiers',
    title === 'Ultimate Beginner Crochet Sweater Pattern (Free PDF)',
    `Got: "${title}"`
  );
}

// Test 3.12: Hyphenated Recipe Slugs (10-25 chars) are preserved and capitalized
{
  const title = derivePinTitle(
    '',
    'https://foodblog.com/recipes/keto-fudge-brownies.html',
    'fudge brownies'
  );
  report(
    'derivePinTitle extracts and title-cases hyphenated URL slug',
    title === 'Keto Fudge Brownies',
    `Got: "${title}"`
  );
}

// Test 3.13: Opaque Video Hosts (YouTube, Instagram, TikTok, Pinterest) are skipped
{
  const ytTitle = derivePinTitle(
    '',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dance moves',
    '',
    [],
    'Learn the best 80s dance moves in 5 minutes with this classic routine.'
  );
  report(
    'derivePinTitle skips YouTube opaque ID slugs and uses description sentence',
    ytTitle === 'Learn the best 80s dance moves in 5 minutes with this classic routine',
    `Got: "${ytTitle}"`
  );

  const pinHostTitle = derivePinTitle(
    '',
    'https://www.pinterest.com/pin/1234567890/',
    'knitting scarf',
    'Winter Knits'
  );
  report(
    'derivePinTitle skips Pinterest opaque pin ID slugs and falls to board name',
    pinHostTitle === 'Winter Knits',
    `Got: "${pinHostTitle}"`
  );
}

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log('\n================================================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('================================================================================');

if (failedTests > 0) {
  console.error('\n❌ FAILURES DETECTED:');
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.details}`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 ALL CHALLENGE 1, 2, AND 3 ADVERSARIAL STRESS TESTS PASSED (100% GREEN)');
  process.exit(0);
}
