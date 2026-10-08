#!/usr/bin/env node

/**
 * scripts/audit_serp_metrics_and_vault.mjs
 * 
 * Forensic Investigation of SERP Ingestion, Pagination Collapse,
 * Displaced Vault Zeroes, and Metrics Disconnect.
 */

import { neon } from '@neondatabase/serverless';
import { getPinDeepDossier, getKeywordDisplacedPins } from '../src/modules/keywords/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 FORENSIC AUDIT: SERP INGESTION, PAGINATION & VAULT ZEROES');
  console.log('================================================================\n');

  // 1. Locate keyword 'healthy dinner recipes'
  const [keywordRow] = await sql`
    SELECT * FROM tracked_keywords 
    WHERE keyword ILIKE 'healthy dinner recipes'
    LIMIT 1;
  `;

  if (!keywordRow) {
    console.error('[-] Keyword "healthy dinner recipes" not found.');
    process.exit(1);
  }

  const kid = keywordRow.id;
  console.log(`[*] Tracked Keyword: "${keywordRow.keyword}" (ID: ${kid})`);
  console.log(`[*] Target Pin Count: ${keywordRow.target_pin_count}`);
  console.log(`[*] Metadata summary:`, JSON.stringify(keywordRow.metadata?.last_crawl_summary || {}));

  // 2. Audit current active SERP snapshots
  const latestSnapDate = await sql`
    SELECT MAX(snapshot_date) as max_date 
    FROM keyword_pins_snapshots 
    WHERE keyword_id = ${kid} AND is_displaced = FALSE;
  `;
  const maxDate = latestSnapDate[0]?.max_date;
  console.log(`[*] Latest Active SERP Snapshot Date: ${maxDate?.toISOString?.()?.slice(0, 10) || maxDate}`);

  const activeSnaps = await sql`
    SELECT pin_id, rank_position, title, domain, save_count, repin_count, comment_count, daily_save_velocity, metadata
    FROM keyword_pins_snapshots
    WHERE keyword_id = ${kid} AND snapshot_date = ${maxDate} AND is_displaced = FALSE
    ORDER BY rank_position ASC;
  `;

  console.log(`[*] Active Organic SERP Pins Count: ${activeSnaps.length} / 100 Target`);

  // Print top 5 SERP pins
  console.log('\nTop 5 Active SERP Pins:');
  console.table(activeSnaps.slice(0, 5).map(p => ({
    rank: p.rank_position,
    pin_id: p.pin_id,
    title: (p.title || '').slice(0, 35),
    saves: p.save_count,
    repins: p.repin_count,
    comments: p.comment_count,
    velocity: p.daily_save_velocity,
    raw_saves: p.metadata?.raw_saves,
    reactions: typeof p.metadata?.reactions === 'object' ? JSON.stringify(p.metadata.reactions) : p.metadata?.reactions
  })));

  // 3. Inspect Pin #1 Disconnect: DB Snapshot vs Deep Dossier
  const pin1 = activeSnaps.find(p => Number(p.rank_position) === 1) || activeSnaps[0];
  if (pin1) {
    console.log(`\n--- [AXIS 2: PIN #1 METRICS DISCONNECT (${pin1.pin_id})] ---`);
    console.log(`[SERP Snapshot in DB]:`);
    console.log(`  Title: "${pin1.title}"`);
    console.log(`  Rank: #${pin1.rank_position}`);
    console.log(`  Saves: ${pin1.save_count}`);
    console.log(`  Repins: ${pin1.repin_count}`);
    console.log(`  Comments: ${pin1.comment_count}`);
    console.log(`  Reactions in Meta:`, pin1.metadata?.reactions);
    console.log(`  Raw Saves in Meta:`, pin1.metadata?.raw_saves);

    console.log(`\n[Executing getPinDeepDossier for Pin #1]...`);
    const dossier = await getPinDeepDossier(sql, pin1.pin_id, kid);
    console.log(`  Dossier Saves: ${dossier.kpis?.total_saves}`);
    console.log(`  Dossier Repins: ${dossier.kpis?.repins}`);
    console.log(`  Dossier Comments: ${dossier.kpis?.comments}`);
    console.log(`  Dossier Shares: ${dossier.kpis?.shares}`);
    console.log(`  Dossier Reactions: ${dossier.kpis?.reactions}`);
  }

  // 4. Audit Displaced Vault Zeroes
  console.log(`\n--- [AXIS 3: DISPLACED VAULT ZEROES AUDIT] ---`);
  const vaultRowsInDb = await sql`
    SELECT id, pin_id, title, last_known_rank, status, current_saves, current_repins, current_comments, current_shares
    FROM keyword_displaced_pins
    WHERE keyword_id = ${kid}
    ORDER BY last_known_rank ASC
    LIMIT 10;
  `;
  const vaultTotalCount = await sql`
    SELECT COUNT(*) as cnt FROM keyword_displaced_pins WHERE keyword_id = ${kid};
  `;
  console.log(`[*] Total Pins in Displaced Vault: ${vaultTotalCount[0]?.cnt}`);
  console.log(`Top 10 Vault rows in keyword_displaced_pins table:`);
  console.table(vaultRowsInDb.map(v => ({
    pin_id: v.pin_id,
    title: (v.title || '').slice(0, 30),
    was_rank: v.last_known_rank,
    saves: v.current_saves,
    repins: v.current_repins,
    comments: v.current_comments,
    shares: v.current_shares
  })));

  // Test getKeywordDisplacedPins function output
  const vaultUiResult = await getKeywordDisplacedPins(sql, kid);
  console.log(`\n[*] getKeywordDisplacedPins returned ${vaultUiResult.pins?.length} pins.`);
  if (vaultUiResult.pins?.length > 0) {
    console.log('Top 5 returned to UI:');
    console.table(vaultUiResult.pins.slice(0, 5).map(p => ({
      pin_id: p.pin_id,
      title: (p.title || '').slice(0, 30),
      last_known_rank: p.last_known_rank,
      saves: p.save_count,
      repins: p.repin_count,
      comments: p.comment_count,
      vacuum_score: p.vacuum_opportunity_score
    })));
  }

  // 5. Test Live Pinterest BaseSearchResource Pagination for 100 pins
  console.log(`\n--- [AXIS 1: LIVE PINTEREST BASESEARCHRESOURCE PAGINATION TEST] ---`);
  const query = encodeURIComponent(keywordRow.keyword);
  const headers = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'x-pinterest-pws-handler': 'www/search/pins.js',
    'referer': `https://www.pinterest.com/search/pins/?q=${query}`
  };

  let bookmark = null;
  let page = 1;
  let collectedPins = [];
  const seenIds = new Set();

  while (collectedPins.length < 100 && page <= 6) {
    const optionsObj = {
      query: decodeURIComponent(query),
      scope: 'pins',
      page_size: 50
    };
    if (bookmark) {
      optionsObj.bookmarks = [bookmark];
    }
    const dataParam = encodeURIComponent(JSON.stringify({ options: optionsObj, context: {} }));
    const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${query}&data=${dataParam}`;

    console.log(`[*] Requesting Page ${page} (bookmark: ${bookmark ? bookmark.slice(0, 20) + '...' : 'none'})...`);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[-] Page ${page} returned HTTP ${res.status}`);
      break;
    }
    const data = await res.json();
    const rawResults = data?.resource_response?.data?.results || [];
    
    // Inspect bookmark structures
    const b1 = data?.resource_response?.bookmark;
    const b2 = Array.isArray(data?.resource_response?.bookmarks) ? data?.resource_response?.bookmarks[0] : null;
    const b3 = data?.resource_response?.data?.bookmark;
    console.log(`  Page ${page} returned ${rawResults.length} raw results.`);
    console.log(`  Bookmarks: bookmark=${b1 ? b1.slice(0, 15) : 'null'}, bookmarks[0]=${b2 ? b2.slice(0, 15) : 'null'}, data.bookmark=${b3 ? b3.slice(0, 15) : 'null'}`);

    let organicPinsOnPage = 0;
    for (const item of rawResults) {
      if (item && item.id && item.type === 'pin' && item.format !== 'Related Interests' && item.format !== 'board') {
        const pid = String(item.id);
        if (!seenIds.has(pid)) {
          seenIds.add(pid);
          collectedPins.push(item);
          organicPinsOnPage++;
        }
      }
    }
    console.log(`  Organic unique pins extracted this page: ${organicPinsOnPage} (Total collected: ${collectedPins.length})`);

    const nextBookmark = b1 || b2 || b3;
    if (!nextBookmark || nextBookmark === '-end-' || nextBookmark === bookmark) {
      console.log(`  Reached end of bookmarks.`);
      break;
    }
    bookmark = nextBookmark;
    page++;
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n[*] Pagination test completed: Collected ${collectedPins.length} organic pins across ${page - 1} pages.`);
  if (collectedPins.length >= 85) {
    console.log(`✅ Pagination can successfully reach >= 85-100 pins when page limit is increased and bookmarks are properly resolved!`);
  } else {
    console.log(`⚠️ Pagination got ${collectedPins.length} pins.`);
  }

  // Inspect stats on first organic pin from live search
  if (collectedPins.length > 0) {
    const p0 = collectedPins[0];
    console.log(`\nSample Live Pin from Search: ID=${p0.id}, Title="${p0.grid_title || p0.title}"`);
    console.log(`  item.save_count:`, p0.save_count);
    console.log(`  item.repin_count:`, p0.repin_count);
    console.log(`  item.aggregated_pin_data:`, p0.aggregated_pin_data);
    console.log(`  item.reaction_counts:`, p0.reaction_counts);
  }
}

runAudit().catch(err => {
  console.error('[-] Audit error:', err);
  process.exit(1);
});
